# Cloudflare 이전 착수 가이드 (Hono + D1 + R2)

이 문서만 보고 구현을 시작할 수 있도록 확정된 결정, 명세, 스키마, 설정, 작업 순서를 적은 실행 문서다. 왜 이전하는가, 비용과 위험은 [cloudflare-migration.md](cloudflare-migration.md)에 있다.

작성 기준일은 2026-10-31이다. "S1" 같은 표시는 9절의 사전 시험 번호이며, 시험 결과로 확정할 항목이다.

> **구현 현황 (2026-11-01, `cloudflare-migration` 브랜치)**: 이 문서대로 `apps/edge`(Hono + D1 + R2)와 프론트 수정(7절)을 구현했다. Worker 테스트 32개가 로컬 D1·R2에서 통과하고, `wrangler dev`로 화면, 로그인, 이미지 업로드와 파생본 생성(로컬 Images), 11MB 영상의 3청크 업로드, SHA-256 일치, Range 재생, 원본 다운로드를 확인했다. 아직 실제 Cloudflare 계정에는 배포하지 않았다. 배포와 git push 자동 배포 설정은 [cloudflare-deploy-guide.html](cloudflare-deploy-guide.html)을 따른다. 구현하면서 정한 것과 달라진 점, 사전 시험(9절) 결과는 14절에 적었다.

## 0. 원칙

- 이전 작업이 끝나 전환하기 전까지는 `apps/api`, `compose.yaml`, `infra/`를 건드리지 않는다. 새 코드는 `apps/edge`에만 만든다.
- 프론트엔드가 호출하는 API 경로와 JSON 모양은 그대로 유지한다(아래 4절에 예외를 적었다). 프론트 수정은 최소로 한다.
- 지금 운영 데이터는 없다. 데이터 이전은 부록 A에 방법만 적어 두었고 이번 범위가 아니다.

## 1. 확정된 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| API | Hono(TypeScript) on Workers | 사용자 결정 |
| DB | D1 (SQLite) | 사용자 결정 |
| 파일 | R2 (비공개 `artist-originals`, 공개 `artist-public`) | 사용자 결정 |
| 플랜 | Workers Paid ($5/월) | 사용자 확인 |
| 영상 | **변환 없이 업로드한 파일 그대로 서빙**. MP4(H.264/AAC)와 WebM만 허용 | 사용자 결정. FFmpeg를 못 돌리고 Stream은 시청 요금이 붙는다 |
| 영상 포스터, 길이, 크기 | 관리자 브라우저가 측정해서 함께 보낸다 | 서버에 ffprobe가 없다 |
| 이미지 파생본 | 업로드 완료 시 Images 변환으로 800/1600/2400px의 WebP와 JPEG를 만들어 공개 버킷에 저장 | 기존 URL 규칙 유지 |
| 이미지 크기 제한 | 이미지 원본은 **20MB 이하**로 제한 | Images 입력 한도. 실제 원본 크기가 미정이라 기본값으로 정함. 12절 참고 |
| 공개 미디어 서빙 | Worker의 `/media/*` 경로가 R2를 읽어 서빙 | 같은 도메인 유지, 프론트 변경 없음 |
| 변환 큐 | 쓰지 않는다. 업로드 완료 요청 안에서 바로 처리 | 영상 변환이 없어져 작업이 짧다 |
| 정적 프론트 | 같은 Worker의 Static Assets | 쿠키, CORS, CSRF를 지금과 같게 유지 |
| 비밀번호 해시 | Argon2id를 WASM으로 (S1에서 확정), 안 되면 7절의 대안 | 기존 해시를 그대로 쓰기 위해 |
| 데이터 이전 | 지금은 하지 않음 | 사용자 확인 (지금 데이터 없음) |

## 2. 사전 준비

계정 작업(사용자가 해야 하는 부분)과 도구 작업이다.

1. Cloudflare 계정에서 Workers Paid 플랜에 가입한다.
2. 도메인이 Cloudflare에 등록되어 있어야 한다(현재 Tunnel에 쓰는 도메인이면 된다).
3. 개발 PC에 Node.js 22 LTS를 준비한다(웹 앱과 같다). `npx wrangler login`으로 로그인한다.
4. 리소스를 만든다.
   ```bash
   cd apps/edge
   # 운영
   npx wrangler d1 create artist-portfolio --location apac   # 출력된 database_id를 wrangler.jsonc에 넣는다
   npx wrangler r2 bucket create artist-originals
   npx wrangler r2 bucket create artist-public
   npx wrangler secret put APP_SECRET_KEY                    # 32자 이상 난수 (openssl rand -hex 32)
   # 스테이징 (리허설용. 운영과 DB, 버킷, 키를 섞지 않는다)
   npx wrangler d1 create artist-portfolio-staging --location apac
   npx wrangler r2 bucket create artist-originals-staging
   npx wrangler r2 bucket create artist-public-staging
   npx wrangler secret put APP_SECRET_KEY --env staging      # 운영과 다른 값
   ```
   D1은 처음 만든 위치(primary)에서 쿼리를 처리하므로 `--location apac`로 한국 방문자와 가까운 곳에 만든다. 생성 후에는 위치를 바꿀 수 없다.
5. 개발용 값은 `apps/edge/.dev.vars`에 둔다. **먼저 저장소 루트 `.gitignore`에 `.dev.vars`와 `.wrangler/`를 추가한다**(비밀 키와 로컬 DB가 커밋되지 않게). 내용:
   ```text
   APP_SECRET_KEY=<개발용 아무 32자 이상 문자열>
   PUBLIC_ORIGIN=http://localhost:8787
   SESSION_COOKIE_SECURE=false
   ```
   `.dev.vars` 값이 `wrangler.jsonc`의 `vars`보다 우선한다. `PUBLIC_ORIGIN`을 개발 주소로 바꾸지 않으면 Origin 검사로 관리자 설정과 로그인이 403이 되고, Secure 쿠키는 `http://`에서 일부 브라우저(Safari)가 저장하지 않는다.

## 3. 저장소 구조와 라이브러리

```text
apps/edge/
  package.json  tsconfig.json  wrangler.jsonc  vitest.config.ts
  migrations/0001_init.sql                # 5절의 스키마
  src/
    index.ts                              # Hono 앱, scheduled 핸들러
    env.ts                                # 바인딩과 변수 타입
    lib/ db.ts time.ts ids.ts errors.ts password.ts session.ts
    routes/ health.ts auth.ts profile.ts artworks.ts collections.ts
            inquiries.ts media.ts admin.ts publicMedia.ts
    media/ detect.ts derive.ts upload.ts
  scripts/create-admin.mjs                # 관리자 생성과 비밀번호 재설정
  test/*.test.ts
```

| 용도 | 선택 |
|---|---|
| 웹 프레임워크 | `hono` |
| 입력 검증 | `zod` + `@hono/zod-validator` (검증 실패는 8절의 오류 형식으로 변환) |
| DB 접근 | D1 prepared statement를 직접 사용. 얇은 함수 모듈로 감싼다(ORM은 쓰지 않는다. 테이블이 11개이고 `batch()`를 직접 다루는 편이 단순하다) |
| 테스트 | `vitest` + `@cloudflare/vitest-pool-workers` (로컬 D1과 R2 사용) |
| Argon2 | WASM 빌드(`argon2w`, `hash-wasm` 등. S1에서 결정) |

## 4. API 명세

모든 경로는 `/api/v1` 아래이고 응답 오류는 `{ "detail": "한국어 메시지" }` 한 가지 형식이다(현재 FastAPI의 검증 오류는 배열이 섞여 프론트에서 깨져 보이므로 문자열로 통일한다). 날짜는 UTC ISO8601 문자열, ID는 `crypto.randomUUID()`다. "관리자"는 세션 쿠키 인증이고, 상태를 바꾸는 요청은 "CSRF"(`X-CSRF-Token` 헤더와 `Origin` 검사)까지 요구한다.

### 4.1 공개

| 메서드 경로 | 설명 |
|---|---|
| `GET /health/live` | `{status:"ok"}` |
| `GET /health/ready` | D1 `SELECT 1` 성공 시 `{status:"ready"}`, 실패 시 503 |
| `GET /profile` | 프로필(행이 없으면 빈 값) |
| `GET /manifest.webmanifest` | 작가 이름으로 만든 PWA 매니페스트. `Accept-Language`가 `ko`로 시작하면 `start_url:"/ko"`, `lang:"ko"`. 헤더 `Cache-Control: no-cache`, `Vary: Accept-Language`, 타입 `application/manifest+json` (현재 `profile.py`와 동일) |
| `GET /artworks?page&size&year&medium&sale_status&series_id&featured` | 공개 작품 목록. `size` 1~50(기본 12). 정렬 `created_at DESC`. 응답 `{items,page,size,total}`. `medium`은 부분 일치(`LIKE`) |
| `GET /artworks/years` | 공개 작품이 있는 연도, 내림차순 |
| `GET /artworks/{slug}` | 공개 작품 상세, 없으면 404 |
| `GET /series` | 시리즈 목록 (`sort_order, name`) |
| `GET /exhibitions` | 공개 전시 (`sort_order ASC`, `start_date DESC`. 아래 주의 참고) |
| `GET /exhibitions/{slug}` | 공개 전시 상세 |
| `POST /inquiries` (201) | 문의 접수. 본문 `{artwork_id?,name,email,message(10~5000자),consent,website}`. `consent`가 false면 422, `website`(허니팟)가 비어 있지 않으면 422, 작품이 비공개거나 삭제됐으면 404. 횟수 제한은 두지 않는다(현재와 같음) |

주의 두 가지.
- 라우트 등록 순서: `/artworks/years`와 `/artworks/admin/all`을 `/artworks/{slug}`보다 **먼저** 등록한다(Hono는 등록 순서대로 맞춘다).
- 정렬의 NULL 처리: PostgreSQL은 `DESC`에서 NULL이 앞에 오고 SQLite는 뒤에 온다. 전시 정렬은 `ORDER BY sort_order, start_date IS NULL DESC, start_date DESC`로 현재 동작에 맞춘다.

### 4.2 인증

| 메서드 경로 | 설명 |
|---|---|
| `GET /auth/setup` | `{needs_setup: boolean}` (관리자 수가 0이면 true) |
| `POST /auth/setup` (201) | 관리자가 없을 때만 첫 관리자 생성 후 로그인. 본문 `{email,password(10~200자),artist_name?}`. `Origin`이 있으면 `PUBLIC_ORIGIN`과 같아야 함(아니면 403). 이미 있으면 409. 동시 요청에도 1명만 만들어야 하므로 `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM admins)`로 한 문장에서 처리 |
| `POST /auth/login` | `{email,password}` → `{csrf_token,email}` + 세션 쿠키 |
| `GET /auth/me` | 세션 확인 `{email,csrf_token}` |
| `POST /auth/logout` | CSRF 필요. 세션을 취소하고 쿠키 삭제 |

세션과 로그인 제한은 현재 동작을 그대로 옮긴다.
- 쿠키 `artist_admin_session`: HttpOnly, SameSite=Lax, 경로 `/`, 24시간, `SESSION_COOKIE_SECURE`가 true면 Secure.
- 토큰은 `crypto.getRandomValues`로 만든 32바이트를 base64url로 쓰고, DB에는 SHA-256 해시만 저장한다. CSRF 토큰은 별도의 32바이트 hex다.
- 로그인 제한: 키 `sha256(APP_SECRET_KEY:ip:email소문자)`. 창 15분, 5회 실패 시 `locked_until`까지 잠금(429). **잠금 확인을 해시 계산 전에 한다**(잠긴 키는 CPU를 쓰지 않는다). 계정이 없을 때도 더미 해시로 검증해서 응답 시간 차이를 없앤다. 성공하면 시도 기록을 지운다.
- IP는 `CF-Connecting-IP` 헤더를 쓴다.

### 4.3 프로필, 작품, 시리즈, 전시, 문의 (관리자)

| 메서드 경로 | 설명 |
|---|---|
| `PUT /profile/admin` | 모든 문자열 값을 `trim` 후 저장. `id=1` 행 upsert |
| `GET /artworks/admin/all` | 삭제되지 않은 모든 작품(비공개 포함), 최신순, 미디어 포함 |
| `POST /artworks/admin` (201) | 작품 생성. 입력 필드는 현재 `ArtworkIn`과 동일(`slug` 정규식 `^[a-z0-9]+(?:-[a-z0-9]+)*$`, `year` 1000~2200 등). slug 중복은 409 |
| `PUT /artworks/admin/{id}` | 수정. 없거나 휴지통이면 404 |
| `DELETE /artworks/admin/{id}` (204) | 휴지통으로 이동(`deleted_at` 설정, `is_published=0`) |
| `GET /series/admin/all` · `POST /series/admin`(201) · `PUT /series/admin/{id}` · `DELETE /series/admin/{id}`(204) | 이름 중복 409, 작품이 쓰는 시리즈 삭제 409 |
| `GET /exhibitions/admin/all` · `POST /exhibitions/admin`(201) · `PUT /exhibitions/admin/{id}` · `DELETE /exhibitions/admin/{id}`(204) | slug 중복 409, 종료일이 시작일보다 빠르면 422 |
| `GET /inquiries/admin` | 삭제되지 않은 문의, 최신순, 작품 제목과 slug 포함 |
| `PATCH /inquiries/admin/{id}` | 본문 `{status:"new"\|"done"}` |
| `DELETE /inquiries/admin/{id}` (204) | 개인정보 제거: `deleted_at` 설정, `name="삭제됨"`, `email="deleted@invalid.local"`, 본문 대체 문구 |

D1의 유니크 제약 오류는 메시지에 `UNIQUE constraint failed`가 들어 있으므로 이를 잡아 409로 바꾼다(S4에서 확인).

### 4.4 미디어

업로드 흐름은 현재와 같다(5MiB 청크, `Upload-Offset` 헤더, 이어받기). 내부 동작만 R2 멀티파트로 바뀐다.

| 메서드 경로 | 설명 |
|---|---|
| `POST /media/uploads` (201) | 본문 `{artwork_id,filename,content_type,total_bytes}`. 허용 `content_type`: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm` (아니면 415). 이미지가 `MAX_IMAGE_BYTES`(20MB)를 넘으면 413, 파일이 `MAX_FILE_BYTES`를 넘으면 413, `저장 중 + 예약 중 + 요청 > MAX_TOTAL_BYTES`면 507. 이 시점에 `media_id`를 미리 정하고 R2 멀티파트를 시작한다 |
| `HEAD /media/uploads/{id}` | 관리자 본인 것만. 헤더 `Upload-Offset`, `Upload-Length`, `Upload-Status` |
| `PATCH /media/uploads/{id}` (204) | 헤더 `Upload-Offset`이 `received_bytes`와 같아야 함(아니면 409 + 올바른 `Upload-Offset`). 본문 크기는 마지막 청크를 제외하고 정확히 5MiB. 선언 크기를 넘으면 413. 응답 헤더 `Upload-Offset`. 같은 위치의 청크가 동시에 들어오면 하나만 처리하고 나머지는 409 (6.1) |
| `POST /media/uploads/{id}/complete` | 본문(선택) `{width,height,duration_ms}`는 **영상일 때만** 사용. 응답 `{media_id,job_id\|null,sha256,content_type,byte_size}`. 상세는 6절 |
| `DELETE /media/uploads/{id}` (204) | 진행 중이면 R2 멀티파트를 `abort()`하고 `cancelled`로 표시 |
| `PUT /media/{media_id}/admin/poster` (신규) | 영상 포스터. 본문은 JPEG 이미지(2MiB 이하). 공개 버킷의 `{media_id}/poster.jpg`에 저장하고 `poster_key` 설정 |
| `DELETE /media/{media_id}/admin` (204) | 작품에서 뺀다(`deleted_at` 설정). 파일은 지우지 않는다 |
| `GET /media/{media_id}/original` | 관리자만. Range 지원(416 처리 포함), `Content-Disposition: attachment; filename*=UTF-8''...`, `Cache-Control: private, no-store` |
| `GET /admin/overview` | 응답 `{storage:{stored_bytes,reserved_bytes,max_total_bytes,max_file_bytes}, new_inquiries, failed_jobs:[{id,media_id,kind,attempts,max_attempts,error,updated_at}]}`. 디스크 항목(`disk_free_bytes`, `min_free_bytes`)은 없어진다 |
| `POST /admin/jobs/{job_id}/retry` | 실패한 이미지 작업을 다시 실행. 완료되면 `{status:"completed"}` 또는 오류 |

### 4.5 공개 파일 `GET|HEAD /media/*` (API 경로 아님)

공개 버킷의 키를 그대로 서빙한다(예: `/media/{media_id}/1600.webp`).
- `..`가 있거나 `/`로 시작하는 키는 404.
- `bucket.get(key, { range: request.headers, onlyIf: request.headers })`로 Range와 조건부 요청(`If-None-Match`)을 처리한다. 206과 304를 정확히 돌려준다.
- 헤더: 저장된 `Content-Type`, `ETag`, `Accept-Ranges: bytes`, `Cache-Control: public, max-age=31536000, immutable`(현재 nginx와 같음).

## 5. D1 스키마 (`migrations/0001_init.sql`)

현재 PostgreSQL 스키마의 최종본을 SQLite 문법으로 옮긴 것이다. 시각은 UTC ISO8601 문자열(`2026-10-31T12:00:00.000Z`)이라 문자열 비교로 정렬된다. 변경점: `media_jobs`의 lease 컬럼 삭제, `upload_sessions`에 R2 멀티파트 정보 추가, `upload_parts` 신설, `inquiries`의 시간 구간 유니크 제약은 이미 현재 코드에서 폐기되어 제외.

```sql
CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_admin_sessions_admin_id ON admin_sessions (admin_id);
CREATE INDEX ix_admin_sessions_expires_at ON admin_sessions (expires_at);

CREATE TABLE login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_login_attempts_locked_until ON login_attempts (locked_until);

CREATE TABLE artist_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  cv TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  headline_en TEXT NOT NULL DEFAULT '',
  intro_en TEXT NOT NULL DEFAULT '',
  bio_en TEXT NOT NULL DEFAULT '',
  cv_en TEXT NOT NULL DEFAULT '',
  location_en TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  bank_holder TEXT NOT NULL DEFAULT '',
  payment_note TEXT NOT NULL DEFAULT '',
  payment_note_en TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE artworks (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  year INTEGER,
  medium TEXT NOT NULL DEFAULT '',
  dimensions TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_text TEXT,
  title_en TEXT NOT NULL DEFAULT '',
  medium_en TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  price_text_en TEXT,
  show_price INTEGER NOT NULL DEFAULT 0 CHECK (show_price IN (0, 1)),
  sale_status TEXT NOT NULL DEFAULT 'unavailable' CHECK (sale_status IN ('unavailable', 'available', 'sold')),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  series_id TEXT REFERENCES series (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX ix_artworks_is_published ON artworks (is_published);
CREATE INDEX ix_artworks_deleted_at ON artworks (deleted_at);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL REFERENCES artworks (id) ON DELETE CASCADE,
  backend TEXT NOT NULL DEFAULT 'r2' CHECK (backend IN ('r2', 'r2-public')),  -- 원본이 있는 버킷: r2=비공개, r2-public=공개(영상)
  original_key TEXT NOT NULL UNIQUE,
  public_key TEXT UNIQUE,      -- 화면에 쓰는 파일 (이미지: 대표 WebP, 영상: 재생 파일)
  poster_key TEXT UNIQUE,      -- 영상 포스터
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT,                 -- 영상은 S5 결과에 따라 NULL일 수 있다
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  source_is_hdr INTEGER NOT NULL DEFAULT 0 CHECK (source_is_hdr IN (0, 1)),  -- 이전 후에는 항상 0 (프론트 호환용)
  hdr_to_sdr INTEGER NOT NULL DEFAULT 0 CHECK (hdr_to_sdr IN (0, 1)),        -- 이전 후에는 항상 0 (프론트 호환용)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX ix_media_assets_artwork_id ON media_assets (artwork_id);
CREATE INDEX ix_media_assets_deleted_at ON media_assets (deleted_at);

CREATE TABLE media_jobs (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_assets (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,          -- process_image
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_media_jobs_media_id ON media_jobs (media_id);
CREATE INDEX ix_media_jobs_status ON media_jobs (status);

CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  artwork_id TEXT NOT NULL REFERENCES artworks (id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,              -- 업로드 시작 때 미리 정한 미디어 ID
  original_filename TEXT NOT NULL,
  declared_content_type TEXT NOT NULL,
  expected_bytes INTEGER NOT NULL,
  received_bytes INTEGER NOT NULL DEFAULT 0,
  r2_bucket TEXT NOT NULL CHECK (r2_bucket IN ('originals', 'public')),
  r2_key TEXT NOT NULL UNIQUE,
  r2_upload_id TEXT NOT NULL,
  chunk_lock_until TEXT,               -- 청크 처리 중 표시 (동시 요청 방지, 60초 후 만료)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_upload_sessions_admin_id ON upload_sessions (admin_id);
CREATE INDEX ix_upload_sessions_artwork_id ON upload_sessions (artwork_id);
CREATE INDEX ix_upload_sessions_status ON upload_sessions (status);
CREATE INDEX ix_upload_sessions_expires_at ON upload_sessions (expires_at);

CREATE TABLE upload_parts (
  upload_id TEXT NOT NULL REFERENCES upload_sessions (id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (upload_id, part_number)
);

CREATE TABLE exhibitions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start_date TEXT,            -- YYYY-MM-DD
  end_date TEXT,
  description TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  venue_en TEXT NOT NULL DEFAULT '',
  location_en TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_exhibitions_is_published ON exhibitions (is_published);

CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,
  artwork_id TEXT REFERENCES artworks (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  consent INTEGER NOT NULL CHECK (consent IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'new',
  fingerprint TEXT NOT NULL,
  created_bucket TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX ix_inquiries_artwork_id ON inquiries (artwork_id);
CREATE INDEX ix_inquiries_fingerprint_created_at ON inquiries (fingerprint, created_at);
```

API가 돌려주는 JSON은 현재와 같이 불리언을 `true/false`로, 시각을 ISO 문자열로 변환해서 내보낸다(`INTEGER 0/1` → boolean 변환은 한 곳의 직렬화 함수에서 처리).

## 6. 미디어 처리 상세

### 6.1 업로드

| 단계 | 동작 |
|---|---|
| 시작 | 용량 검사 후 `media_id = randomUUID()`를 정한다. 이미지는 비공개 버킷 `{artwork_id}/{uuid}{확장자}`, **영상은 공개 버킷 `{media_id}/playback.{mp4\|webm}`**에 `createMultipartUpload`로 시작한다(영상은 변환이 없어 원본이 곧 재생 파일이다). `upload_id`, `key`, 버킷을 `upload_sessions`에 저장 |
| 청크 | 파트 번호 = `offset / 5MiB + 1`. ① 선점: `UPDATE upload_sessions SET chunk_lock_until = <지금+60초> WHERE id = ? AND status = 'active' AND received_bytes = ? AND (chunk_lock_until IS NULL OR chunk_lock_until < <지금>)`. 바뀐 행이 0이면 409와 현재 `Upload-Offset`을 돌려준다. ② 본문을 `arrayBuffer()`로 읽어(5MiB) `uploadPart`. ③ `batch()`로 `upload_parts` upsert, `received_bytes = received_bytes + 크기`, `chunk_lock_until = NULL`을 함께 처리. ②가 실패하면 `chunk_lock_until`만 비운다. 현재 코드의 파일 잠금(`fcntl.flock`)을 대신한다 |
| 완료 | `received_bytes == expected_bytes` 확인 → 저장된 파트를 번호순으로 모아 `complete()` → 객체 크기가 선언 크기와 같은지 확인 → 6.2~6.3 → `batch()`로 `media_assets` 추가, 세션 `completed` 처리 |
| 취소/만료 | `abort()` 호출. 매일 도는 Cron이 만료된 세션(`UPLOAD_EXPIRY_HOURS`)을 같은 방식으로 정리 |

R2는 마지막 파트를 제외한 파트의 최소 크기가 5MiB이고, 파트는 최대 10,000개, 객체는 최대 5TiB다. 5MiB 청크로 5GB는 약 1,024개 파트다.

### 6.2 파일 형식 확인

선언한 `content_type`과 파일 앞부분 바이트를 비교한다(`bucket.get(key, {range:{offset:0,length:32}})`).

| 형식 | 확인 |
|---|---|
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| WebP | `RIFF`(0~3) 와 `WEBP`(8~11) |
| MP4 | 4~7바이트가 `ftyp`이고 브랜드가 `qt  `(MOV)가 아님 |
| WebM | `1A 45 DF A3` |

맞지 않으면 415를 돌려주고 업로드한 객체를 삭제한다. 영상은 코덱을 서버에서 확인할 수 없으므로 7.1의 브라우저 검사에 의존한다.

### 6.3 이미지 파생본

업로드 완료 요청 안에서 동기로 처리한다.

1. `IMAGES.input(stream).info()`로 원본 `width`, `height`를 얻는다(과금 없음).
2. 폭 800, 1600, 2400 각각에 대해 `w = min(요청 폭, 원본 폭)`로 WebP(품질 85)와 JPEG(품질 88)를 만든다. 업스케일은 하지 않는다. 폭이 원본과 같아지면 거기서 멈춘다(현재 `process_image`와 동일). 모든 변환에 메타데이터 제거(`metadata: "none"`)를 지정해 사진의 위치(GPS)와 촬영 기기 정보가 공개 파일에 남지 않게 한다. 현재 Pillow도 EXIF를 버린다. 바인딩에서 이 옵션을 넣는 위치는 S2에서 확인한다.
3. 결과는 `arrayBuffer()`로 받아(수 MB 이하) 공개 버킷 `{media_id}/{w}.webp`, `{media_id}/{w}.jpg`에 저장한다. 키 규칙이 현재와 같아서 프론트는 바뀌지 않는다.
4. `public_key`는 현재 규칙대로 정한다: WebP 중 폭 1600 이하 가운데 가장 큰 것(없으면 첫 번째).
5. 성공하면 `status='ready'`, `media_jobs`는 `completed`. 실패하면 `status='failed'`, `media_jobs.status='failed'`와 `error`를 기록한다(관리자 화면에 실패 작업으로 표시되고 `retry`로 다시 실행).

원본 한 장당 변환은 6건이고 월 5,000건이 무료다. 변환 URL을 외부에 열지 않으므로 사용자가 임의로 변환 수를 늘릴 수 없다.

원본은 파일 형식 확인이 끝난 뒤 한 번 더 `get()`해서 변환마다 새 스트림으로 넘긴다. ICC 프로필과 EXIF 회전이 기존 Pillow 결과와 같은지는 S2에서 확인한다.

### 6.4 영상

- 변환하지 않는다. 완료 시 곧바로 `status='ready'`, `public_key = original_key = {media_id}/playback.{ext}`, `backend='r2-public'`, `media_jobs` 행은 만들지 않고 `job_id`는 `null`로 응답한다.
- `width`, `height`, `duration_ms`는 `complete` 본문의 값을 쓴다(범위 검사: 1~20000, 길이 0~24시간).
- 포스터는 `PUT /media/{id}/admin/poster`로 따로 올린다. 포스터가 없으면 목록 카드에 이미지가 비어 보이므로 프론트가 반드시 올리도록 한다(7.1 참고).
- 재생 파일 URL은 `/media/{media_id}/playback.mp4`이고, 4.5절의 Range 처리로 탐색(시크)이 된다.

### 6.5 SHA-256

`DigestStream("SHA-256")`에 R2 객체 본문을 흘려 전체 해시를 계산한다. 영상은 최대 5GB라 시간이 오래 걸릴 수 있으므로 S5 결과가 나쁘면 영상의 `sha256`은 `NULL`로 두고 이미지만 계산한다.

## 7. 프론트엔드 변경

| 파일 | 변경 |
|---|---|
| `apps/web/vite.config.ts` | 개발 프록시 `/api`, `/media` 대상을 `http://localhost:8787`(`wrangler dev`)로 |
| `apps/web/src/pages/MediaUpload.tsx` | 허용 형식에서 MOV(`video/quicktime`, `.mov`, `.m4v`) 제거. 이미지가 20MB를 넘으면 업로드 전에 안내. **영상이면** 업로드 전에 `<video>`로 메타데이터를 읽어(재생 가능 여부, 폭, 높이, 길이) 재생 불가면 막고, 1초 지점 프레임을 캔버스로 JPEG 포스터로 만들어 둔다. `complete`에 `{width,height,duration_ms}`를 실어 보내고 이어서 포스터를 `PUT`한다 |
| `apps/web/src/pages/Admin.tsx` | 서버 현황의 "디스크 잔여 공간" 표시를 "남은 저장 용량"(`max_total_bytes - stored_bytes - reserved_bytes`)으로 교체 |
| 안내 문구 | `grep -rniE "mov|hdr|디스크" apps/web/src`로 HDR, MOV, 디스크를 언급하는 문구(`Guide.tsx`, `lib/i18n.ts` 등)를 찾아 새 규칙(MP4/WebM, 영상은 변환 없이 그대로 재생됨)으로 고친다 |
| 나머지 | 변경 없음 |

### 7.1 영상 업로드 안내 (관리자 화면에 표시)

영상은 변환하지 않으므로 올리는 파일이 곧 재생 파일이다. 웹 재생용으로 **H.264 + AAC MP4(또는 WebM), SDR, 가로 1920px 이하, 5~10Mbps 정도**로 내보낸 파일을 올린다. HDR(HLG, PQ) 영상은 일부 기기에서 색이 바래 보이므로 SDR로 내보내서 올린다. 크고 높은 비트레이트 파일은 첫 재생이 느리다.

## 8. 설정

### 8.1 `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "artist-portfolio",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-31",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": false,   // 운영은 도메인으로만 접근 (workers.dev 주소는 WAF 규칙을 우회한다)
  "assets": {
    "directory": "../web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*", "/media/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "artist-portfolio", "database_id": "<wrangler d1 create 결과>", "migrations_dir": "migrations" }
  ],
  "r2_buckets": [
    { "binding": "MEDIA_ORIGINALS", "bucket_name": "artist-originals" },
    { "binding": "MEDIA_PUBLIC", "bucket_name": "artist-public" }
  ],
  "images": { "binding": "IMAGES" },
  "triggers": { "crons": ["0 18 * * *"] },   // 매일 18:00 UTC = 03:00 KST: 만료 업로드·세션·로그인 기록 정리
  "vars": {
    "PUBLIC_ORIGIN": "https://example.com",
    "SESSION_COOKIE_SECURE": "true",
    "MAX_FILE_BYTES": "5368709120",
    "MAX_IMAGE_BYTES": "20971520",
    "MAX_TOTAL_BYTES": "107374182400",
    "UPLOAD_EXPIRY_HOURS": "24",
    "LOGIN_MAX_ATTEMPTS": "5",
    "LOGIN_WINDOW_MINUTES": "15"
  },
  "observability": { "enabled": true },
  "env": {
    // 리허설용. 이름은 artist-portfolio-staging이 되고 https://artist-portfolio-staging.<계정>.workers.dev 로 열린다
    // 바인딩과 vars는 환경 간에 상속되지 않으므로 전부 다시 적는다
    "staging": {
      "workers_dev": true,
      "d1_databases": [
        { "binding": "DB", "database_name": "artist-portfolio-staging", "database_id": "<스테이징 database_id>", "migrations_dir": "migrations" }
      ],
      "r2_buckets": [
        { "binding": "MEDIA_ORIGINALS", "bucket_name": "artist-originals-staging" },
        { "binding": "MEDIA_PUBLIC", "bucket_name": "artist-public-staging" }
      ],
      "images": { "binding": "IMAGES" },
      "triggers": { "crons": ["0 18 * * *"] },
      "vars": {
        "PUBLIC_ORIGIN": "https://artist-portfolio-staging.<계정>.workers.dev",
        "SESSION_COOKIE_SECURE": "true",
        "MAX_FILE_BYTES": "5368709120",
        "MAX_IMAGE_BYTES": "20971520",
        "MAX_TOTAL_BYTES": "10737418240",
        "UPLOAD_EXPIRY_HOURS": "24",
        "LOGIN_MAX_ATTEMPTS": "5",
        "LOGIN_WINDOW_MINUTES": "15"
      }
    }
  }
}
```

- `PUBLIC_ORIGIN`은 환경마다 실제 접속 주소와 정확히 같아야 한다. 다르면 Origin 검사로 관리자 설정, 로그인 후 모든 변경 요청이 403이 된다(현재 `deploy-cloudflare.md`의 문제 해결 표와 같은 원인).
- 스테이징 `MAX_TOTAL_BYTES`는 10GB로 낮춰 리허설 중 R2 비용이 늘지 않게 한다.
- 스테이징은 도메인이 아니라 workers.dev 주소라 WAF 규칙이 적용되지 않는다. 주소를 외부에 알리지 않고, 리허설이 끝나면 `npx wrangler delete --env staging`으로 지우거나 데이터를 비운다.

- 비밀 값 `APP_SECRET_KEY`는 `wrangler secret put`으로 넣는다(`vars`에 쓰지 않는다).
- 도메인 연결은 컷오버 때 `routes: [{ "pattern": "example.com", "custom_domain": true }]`를 추가한다. 같은 호스트 이름의 기존 DNS 레코드가 있으면 연결이 실패하므로 Tunnel용 레코드를 먼저 지운다.
- 로컬 `wrangler dev`의 Images는 저충실도 모드라 폭, 높이, 회전, 형식만 지원한다. 품질과 색 처리 확인은 원격 모드나 배포 후에 한다.
- 이미지 변환의 `info()`와 `input()` 동작은 문서의 예시(`env.IMAGES.input(stream).transform({width}).output({format, quality}).response()`)를 기준으로 한다.

### 8.2 환경 변수와 현재 설정 대응

| 현재 (`.env`) | 이전 후 |
|---|---|
| `APP_ENV`, `DATABASE_URL`, `POSTGRES_*`, `STORAGE_ROOT`, `MIN_FREE_BYTES` | 불필요 |
| `APP_SECRET_KEY` | Secret |
| `PUBLIC_ORIGIN`, `SESSION_COOKIE_SECURE`, `MAX_FILE_BYTES`, `MAX_TOTAL_BYTES`, `UPLOAD_EXPIRY_HOURS`, `LOGIN_*` | `vars` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `scripts/create-admin.mjs`로 대체 (아래) |
| `SEED_DEMO_DATA` | 제외(Pillow 의존). 필요하면 개발용 SQL 시드를 따로 만든다 |
| `TRASH_RETENTION_DAYS` | 현재도 자동 삭제 코드가 없다. 이전에서도 구현하지 않는다 |

### 8.3 관리자 계정

시작 시 환경 변수로 계정을 맞추던 `sync-admin`은 Workers에 시작 훅이 없어 쓸 수 없다. 대신 `scripts/create-admin.mjs`를 만든다.
- 이메일을 인자로, 비밀번호는 프롬프트로 입력받아 같은 Argon2 설정으로 해시한다.
- `wrangler d1 execute artist-portfolio --remote --file <임시 SQL>`로 `admins`에 넣는다(해시가 셸 기록에 남지 않도록 `--command`가 아니라 임시 파일을 쓴다).
- 이미 있는 이메일이면 비밀번호를 바꾸고 그 관리자의 세션을 모두 취소한다(현재 `reset-admin`과 같음).
- **도메인을 공개하기 전에 이 스크립트로 관리자를 만든다.** 관리자가 없는 상태로 공개하면 첫 접속자가 `/auth/setup`으로 관리자가 될 수 있다.

### 8.4 배포 절차 (`apps/edge/scripts/deploy.sh`)

현재 `scripts/deploy.sh`를 대신한다. 순서가 중요하다.

```bash
#!/usr/bin/env bash
set -euo pipefail
ENV_ARGS=()            # 스테이징이면: deploy.sh staging
[[ "${1:-}" == "staging" ]] && ENV_ARGS=(--env staging)
DB_NAME=$([[ "${1:-}" == "staging" ]] && echo artist-portfolio-staging || echo artist-portfolio)
cd "$(dirname "$0")/.."
npm ci && npm test                                         # Worker 테스트
(cd ../web && npm ci && npm test && npm run build)         # 프론트 빌드 → ../web/dist
npx wrangler d1 time-travel info "$DB_NAME"                # 되돌릴 시점(bookmark)을 로그에 남긴다
npx wrangler d1 migrations apply "$DB_NAME" --remote "${ENV_ARGS[@]}"
npx wrangler deploy "${ENV_ARGS[@]}"
```

- 마이그레이션을 배포보다 먼저 적용한다. 새 코드가 새 컬럼을 기대하기 때문이다. 그래서 마이그레이션은 기존 코드가 계속 동작하도록 "추가만" 하고(컬럼 추가, 기본값 지정), 컬럼 삭제와 이름 변경은 코드 배포 후 다음 마이그레이션에서 한다.
- 문제가 생기면 코드는 `npx wrangler rollback`으로, DB는 출력된 bookmark로 `wrangler d1 time-travel restore`로 되돌린다.
- 배포 후 `curl -fsS https://<도메인>/api/v1/health/ready`로 확인한다.
- 프론트는 API와 같은 도메인이라 `VITE_API_BASE_URL`, `VITE_MEDIA_BASE_URL`을 지정하지 않는다.
- git push 자동 배포는 GitHub Actions 대신 Cloudflare **Workers Builds**(Git 연결)를 쓴다. 빌드 명령 `npm run build:web`, 배포 명령 `npm run deploy:ci`(마이그레이션 후 배포), 루트 디렉터리 `apps/edge`. 기본 빌드 토큰에는 D1 권한이 없어 D1 Edit을 넣은 토큰을 따로 만든다. 절차는 [cloudflare-deploy-guide.html](cloudflare-deploy-guide.html).

## 9. 사전 시험 (구현 전에 한다)

각 시험은 `apps/edge`에서 최소 Worker로 한다. 합격하지 못하면 대안을 적용하고 이 표에 결과를 적는다.

| ID | 확인할 것 | 합격 기준 | 불합격 시 대안 |
|---|---|---|---|
| S1 | Argon2 WASM이 Workers에서 도는가. **기존 해시(`m=65536,t=3,p=2`) 검증이 되는가**. 1회 CPU 시간과 메모리 | 검증 성공, 1회 약 1초 이하, 메모리 초과 없음 | (a) 비용 조절: `m=19456,t=2,p=1`(OWASP 최소 권장)로 새 해시를 만들고 로그인 때 자동 재해시. (b) `node:crypto`(`nodejs_compat`)의 scrypt. (c) Web Crypto PBKDF2는 반복 횟수가 10만 번으로 제한되어 보안이 약하므로 마지막 수단 |
| S2 | Images 바인딩의 출력 품질 | JPEG(EXIF 회전 포함), 다른 색공간(Display P3 등) ICC 프로필, 투명 PNG, 20MB 근처 파일 5종을 변환해 기존 Pillow 결과와 방향과 색이 같게 보임. `info()` 크기 일치. 결과 파일에 위치(GPS)와 촬영 기기 정보가 없음(`exiftool`로 확인) | 20MB 한도가 문제면 브라우저에서 파생본을 만들어 올리는 방식으로 대체(관리자 PC에서 캔버스로 리사이즈). 색이나 방향이 다르면 같은 방식 |
| S3 | R2 멀티파트: Worker에서 5MiB 파트 업로드, 중간에 끊고 이어받기, 1GB 업로드 | 이어받기 성공, `complete` 후 크기 일치, 요청당 메모리와 CPU 문제 없음, 파트 크기 규칙 확인 | 청크 크기 조정 |
| S4 | D1: `batch()` 롤백, 첫 관리자 동시 생성(요청 2개 동시) 중 1개만 성공, 유니크 오류 메시지 매핑, 전시 정렬 NULL 순서 | 모두 기대대로 | 쿼리 수정 |
| S5 | 1GB와 5GB 객체의 `DigestStream` 해시 시간과 CPU | 완료 요청이 몇 분 안에 끝남 | 영상은 해시 생략(`sha256 NULL`) |
| S6 | 공개 버킷의 큰 MP4를 `/media/*`로 재생 (Chrome, Safari, iOS Safari) | Range 206 응답으로 탐색 가능, 시작 지연이 수용 가능 | 응답 헤더나 Range 처리 수정 |
| S7 | `@cloudflare/vitest-pool-workers`로 로컬 D1과 R2를 쓰는 테스트가 도는가. Images는 스텁 | 단일 테스트가 통과 | 테스트 구성 조정 |

## 10. 과금과 사용량 관리

고민이 필요한 부분이라 필수와 선택으로 나눈다.

**로그인 과금**: Workers 유료 플랜은 CPU 시간 월 3천만 ms가 포함되고 초과 시 100만 ms당 $0.02다. 로그인 1회를 1초로 잡아도 월 3만 번까지 포함 범위다. 관리자 한 명이 쓰는 용도에서는 사실상 0원이다. 위험은 무차별 대입 공격이 CPU를 쓰게 하는 경우뿐이다(1초 x 100만 번 = 약 $19). 그래서 다음을 둔다.
- 잠금 확인을 해시 계산보다 먼저 한다(4.2절).
- Cloudflare WAF의 속도 제한 규칙을 `/api/v1/auth/login`에 건다(예: IP당 분당 10회). 무료 플랜에서 쓸 수 있는 규칙 수는 확인 필요.
- 필요하면 S1의 "비용 조절" 대안으로 해시 비용을 낮춘다. 사양을 바꿔도 되는 부분이다.

| 단계 | 내용 | 시점 |
|---|---|---|
| 0 (필수) | Cloudflare 대시보드에서 사용량과 결제 알림을 설정한다(메뉴 이름은 확인 필요). `/api/v1/inquiries`와 `/api/v1/auth/login`에 WAF 속도 제한을 건다 | M6 |
| 1 (선택) | 이미지 변환 건수를 월별로 세는 `usage_counters(month, metric, value)` 테이블을 추가하고(`0002` 마이그레이션) 관리자 현황에 "이번 달 이미지 변환 N / 5,000"을 보여준다. 저장 용량은 이미 `stored_bytes`로 보인다 | 운영해 보고 필요할 때 |
| 2 (선택) | Cloudflare GraphQL Analytics API로 Workers 요청 수, R2 용량을 가져와 현황에 표시한다. API 토큰을 Secret으로 둬야 해서 보류 | 필요할 때 |

## 11. 테스트 이전 목록

현재 `apps/api/tests/test_api.py`의 시나리오를 `vitest`로 옮긴다.

| 옮긴다 | 비고 |
|---|---|
| health, 비공개 작품은 공개 목록과 상세에 안 나옴 | |
| 관리자 인증과 CSRF, 작품 생성 | |
| 로그인 시도 제한 | |
| 문의는 동의 필수이고 횟수 제한 없음 | |
| 첫 관리자 설정, 외부 Origin 거부, 작가 이름 반영과 프로필 수정 | |
| 청크 업로드 이어받기와 완료, 원본 Range 다운로드 | R2 멀티파트로 다시 작성 (5MiB 이상 데이터 필요) |
| 서버 현황과 실패 작업 재시도 | `IMAGES`를 스텁으로 |
| 시리즈 필터, 전시 관리, 시리즈와 전시 수정, 삭제 | |
| 영어 필드 왕복, 공개 연도 목록, 미디어 삭제, 휴지통 작품 숨김 | |
| 문의 관리(조회, 처리 완료 표시) | |
| 웹 매니페스트(작가 이름, 기기 언어) | |
| 새로 쓴다 | 영상 업로드 후 포스터 등록, 이미지 20MB 초과 거부, 형식(매직 바이트) 불일치 거부, 이미지 파생본 키 생성 |
| 옮기지 않는다 | `seed-demo`, `sync-admin`(대체됨), 마이그레이션 규칙(`test_migrations`), 로컬 스토리지, Pillow 변환 |

## 12. 작업 순서

| 단계 | 내용 | 끝났다고 보는 기준 |
|---|---|---|
| M0 | 2절 사전 준비(`.gitignore`에 `.dev.vars`, `.wrangler/` 추가 포함). `apps/edge` 골격 생성, `wrangler dev` 구동 | `GET /api/v1/health/live`가 200 |
| M1 | 9절 S1~S7 시험. 결과를 9절 표에 기록 | 모든 시험에 합격하거나 대안이 정해짐 |
| M2 | 스키마 적용, 공개 읽기 API(health, profile, manifest, artworks, series, exhibitions, years), 문의 접수 | 개발 서버에서 프론트 공개 페이지가 정상 표시 |
| M3 | 인증(setup, login, me, logout), 세션, CSRF, 로그인 제한, 관리자 CRUD(프로필, 작품, 시리즈, 전시, 문의), 서버 현황 | 관리자 화면에서 영상과 이미지 업로드를 제외한 모든 기능 동작 |
| M4 | 미디어: 업로드(멀티파트), 완료, 형식 확인, 이미지 파생본, `/media/*`, 원본 다운로드, 삭제, 영상 포스터, 실패 작업 재시도 | 이미지와 영상 업로드, 표시, 재생이 개발 환경에서 동작 |
| M5 | 프론트 수정(7절), `docs/test-scenarios.html` 전체 점검, 11절 테스트 통과 | 시나리오와 테스트 모두 통과 |
| M6 | 운영 설정: 시크릿, Cron, WAF 속도 제한, 결제 알림, Time Travel 확인. 스테이징(`deploy.sh staging`, 별도 D1과 버킷)에서 리허설. 원본 백업 방법 확정. 개인정보 고지 결정(13절) 반영 | 스테이징에서 전체 시나리오 통과 |
| M7 | 컷오버: 관리자 생성 → Tunnel의 Public Hostname과 DNS 레코드 삭제 → 커스텀 도메인 연결 → 확인. 기존 Docker 스택은 중지만 하고 보관 | 도메인에서 전체 시나리오 통과 |
| M8 | 1주 관찰 후 정리: `apps/api`, `compose.yaml`, `infra/`, `scripts/deploy.sh` 제거, `deploy-cloudflare.md`와 README 갱신 | 문서가 새 구성과 일치 |

백업은 두 곳이다. D1은 Time Travel로 30일 안의 시점으로 복원할 수 있다(유료 플랜). R2에는 스냅샷 기능이 없으므로 `rclone sync`로 주기적으로 다른 곳(개인 PC, 외장 디스크 등)에 복사해 둔다. 원본 이미지는 이 사이트에서 유일한 사본일 수 있어 M6에서 방법을 확정한다.

## 13. 아직 정해지지 않은 것

| 항목 | 현재 기본값 | 정해야 하는 때 |
|---|---|---|
| 작품 원본 이미지의 실제 크기 | 20MB 이하로 가정하고 초과분은 업로드 거부 | M1 이전에 실제 원본 몇 장의 크기를 확인한다. 20MB를 자주 넘으면 S2에서 브라우저 파생본 방식으로 바꾼다 |
| WAF 속도 제한 규칙의 무료 한도 | 로그인과 문의에 각각 1개를 쓰려 함 | M6 |
| Argon2 사양 (기존 유지 vs 비용 낮춤) | 기존 유지(`m=65536,t=3,p=2`) | S1 결과 |
| 영상 파일 해시 | 계산 | S5 결과 |
| 개인정보 국외 이전 고지 | 미정. 문의자의 이름과 이메일이 지금은 집 PC(국내)에 저장되지만, 이전 후에는 Cloudflare(해외 사업자, D1은 아시아 태평양 지역)에 저장된다. 현재 동의 문구(`lib/i18n.ts`의 `consent`)는 수집 목적만 적고 있다. 국외 이전 고지(이전받는 자, 국가, 항목, 보유 기간)가 필요한지 확인하고, 필요하면 동의 문구나 개인정보 처리방침 페이지를 추가한다. 법률 판단이 필요한 항목이다 | M6, 전환 전 |

## 14. 구현하면서 정한 것 (2026-11-01)

| 항목 | 결정 | 이유 |
|---|---|---|
| Argon2 (S1) | `@noble/hashes`의 순수 JS Argon2id. 새 해시는 `m=19456,t=2,p=1`(S1 대안 a), 기존 `m=65536,t=3,p=2` 해시도 문자열의 값으로 검증 | Workers는 실행 중 WASM 컴파일(`hash-wasm` 방식)을 막는다. 순수 JS로 1회 약 0.2초(기존 사양은 약 1초, Node 22 측정). argon2-cffi가 만든 해시 검증을 테스트로 확인. 옮겨 올 기존 계정이 없어 로그인 때 자동 재해시는 넣지 않았다 |
| 테스트 (S7) | `@cloudflare/vitest-pool-workers`가 `@cloudflare/vitest-plugin`으로 이름이 바뀌어 그것을 쓴다. Images는 테스트에서 대역(stub) | 합격 |
| 영상 SHA-256 (S5) | `SHA256_MAX_BYTES`(기본 1GiB) 이하만 계산하고 넘으면 `NULL` | 5GB 해시는 완료 요청 시간이 길어진다. 실제 시간은 배포 후 확인 |
| 이미지 파생본 실패 | `complete`는 200으로 응답하고 `job_status:"failed"`, `error`를 함께 준다. 프론트가 안내를 띄우고 서버 현황에서 재시도 | 원본은 이미 저장됐으므로 업로드 자체를 실패로 보이지 않게 |
| 재시도 응답 | `{status:"completed"\|"failed", error}` (그 자리에서 실행) | 큐가 없어졌다 |
| 영상 포스터 키 | `{media_id}/poster-{8자}.jpg` | 공개 파일은 1년 캐시라 다시 올릴 때 이름을 바꾼다 |
| 형식이 빈 파일 | `content_type`이 비었거나 `application/octet-stream`이면 파일 이름의 확장자로 판단 | 일부 안드로이드가 형식을 비워 보낸다 |
| 서버 현황 | `storage`에 `max_image_bytes` 추가, `disk_free_bytes`, `min_free_bytes` 제거 | |
| Preview 빌드 | 끈다 | 미리보기 버전도 운영 D1·R2를 쓴다 |
| compatibility_date | `2026-10-23` | 로컬 workerd가 지원하는 최신 날짜 이하여야 테스트가 돈다 |

남은 확인(배포 후, S2·S6): 투명 PNG를 JPEG로 만들 때 흰 배경이 되는지(로컬 Images는 저충실도라 `background`를 무시하고 검정으로 채운다. 지금 화면은 WebP 파생본만 쓰고 JPEG 파생본은 쓰지 않아 영향이 작지만 확인한다), EXIF 회전과 색 프로필, 결과 파일에 GPS가 없는지, iOS Safari에서 큰 MP4 탐색.

## 부록 A. 데이터 이전 (지금은 하지 않음, 나중에 필요할 때)

운영 데이터가 생긴 뒤에 이전해야 한다면 다음 순서로 한다. 이번 범위가 아니며 방법만 적어 둔다.

1. **DB**: PostgreSQL에서 테이블별로 읽어 값을 변환한 `INSERT` SQL을 만든다(`wrangler d1 execute --file`). 변환: `boolean → 0/1`, 시각 → UTC ISO8601 문자열, enum → 문자열 그대로, `date → YYYY-MM-DD`. `media_assets.backend`는 `local` → `r2`로 바꾼다. `media_jobs`의 lease 컬럼은 버린다. `upload_sessions`는 진행 중인 것이 없을 때만 이전하거나 버린다.
2. **파일**: 볼륨의 `originals`를 `artist-originals`로, `public`을 `artist-public`로 키를 그대로 `rclone`(R2의 S3 호환 주소)으로 복사한다. 이미지 파생본 키 규칙(`{media_id}/{폭}.webp|jpg`)이 같아 DB의 `public_key`를 바꿀 필요가 없다.
3. **기존 영상**: 이미 변환된 `playback.mp4`와 `poster.jpg`는 공개 버킷에 같은 키로 복사하면 된다. 이 경우 원본은 비공개 버킷에 있으므로 `backend='r2'`, `public_key`는 공개 버킷의 `playback.mp4`를 가리키는 현재 상태 그대로다.
4. **검증**: 원본마다 `media_assets.sha256`과 R2 객체의 해시를 비교한다. 검증 전에는 기존 볼륨과 DB 덤프를 지우지 않는다.
5. **관리자 계정**: 해시가 같은 Argon2 형식이므로 S1에서 검증이 되면 그대로 가져올 수 있다. 아니면 `create-admin.mjs`로 재설정한다.
