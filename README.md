# 현대미술 작가 포트폴리오

한 명의 작가를 위한 포트폴리오·온라인 전시·판매 문의 서비스입니다. 현재는 첫 완성본을 향해 구현 중이며, 공개 페이지, 서버 세션 인증과 첫 관리자 설정, 작품·문의·시리즈·전시 관리, 재개 가능한 미디어 업로드와 이미지·영상 변환이 연결되어 있습니다. 작가 이름과 소개는 코드에 고정되어 있지 않고 관리자 화면의 **작가 프로필**에서 설정합니다.

## 현재 구조

```text
브라우저 → Nginx gateway ─┬→ React 정적 파일
                          ├→ /api → FastAPI → PostgreSQL
                          └→ /media → 공개 파생본
                                       ↑
                           media-worker ─┴→ 비공개 원본 볼륨
```

- `apps/web`: React + TypeScript + Vite + React Router + TanStack Query
- `apps/api`: FastAPI + Pydantic + SQLAlchemy + Alembic, API 경로 `/api/v1`
- `infra/nginx`: 동일 출처 gateway와 공개 미디어 설정
- `docs`: 운영·이전·진행 문서, [DB 스키마](docs/db/schema.sql), [수동 테스트 시나리오](docs/test-scenarios.html)

## 필요 도구

- Docker와 Docker Compose
- 로컬 개발 시 Node.js 22 이상과 Python 3.12 추가

현재 사용자에게 Docker 권한이 없으면 `permission denied ... docker.sock` 오류가 납니다. 이때는 아래 명령 후 다시 로그인합니다.

```bash
sudo usermod -aG docker $USER
```

## Docker Compose로 실행 (권장)

### 1. 실행

```bash
docker compose up -d
```

처음 실행하면 이미지 빌드(프론트 빌드 포함)가 진행되어 몇 분 걸릴 수 있습니다. DB 마이그레이션은 API 컨테이너가 시작할 때마다 자동으로 적용됩니다. Node나 Python을 호스트에 설치할 필요는 없습니다.

접속 주소는 `http://localhost:8080`입니다. 관리자 계정이 아직 없으면 어느 페이지로 들어가도 **관리자 계정 설정** 화면(`/admin`)이 나오고(`.env`로 관리자를 정했다면 나오지 않음, 아래 4번 참고), 여기서 작가 이름, 관리자 이메일과 비밀번호(10자 이상)를 정하면 바로 로그인됩니다. 이 화면은 첫 관리자를 만들 때 한 번만 쓸 수 있으므로, 외부에 공개(Cloudflare Tunnel 등)하기 전에 먼저 계정을 만들어 두세요. API 문서는 `/api/v1/docs`입니다.

코드를 바꾼 뒤에는 `docker compose up -d --build`로 이미지를 다시 빌드해야 반영됩니다. 종료는 `docker compose down`, 로그 확인은 `docker compose logs -f api`입니다. `docker compose down -v`는 DB와 업로드 파일 볼륨까지 지우므로 처음 상태로 돌아갑니다.

포트는 `8080`(nginx 게이트웨이) 하나만 호스트에 열립니다. API(`8000`)와 DB(`5432`)는 컨테이너끼리만 통신하며, `/api` 요청은 nginx가 API로 전달합니다.

### 2. 환경 설정 (`.env`)

내 PC에서 시험할 때는 `.env` 없이 실행해도 됩니다. 이때는 개발용 기본값(DB 비밀번호 `change-me`, 개발용 시크릿 키, `http://localhost:8080`)을 씁니다.

외부에 공개하거나 기본값을 바꾸려면 `.env`를 만듭니다. `.env`나 셸 환경 변수에 있는 값이 기본값보다 우선합니다.

```bash
cp .env.example .env
openssl rand -hex 32   # 출력값을 APP_SECRET_KEY에 넣기
```

- `APP_SECRET_KEY`: 위에서 만든 64자 난수. `openssl`이 없으면 `python3 -c "import secrets; print(secrets.token_hex(32))"`
- `POSTGRES_PASSWORD`: DB 비밀번호
- `DATABASE_URL`: 안의 비밀번호(`change-me` 부분)를 `POSTGRES_PASSWORD`와 같은 값으로 변경. 다르면 API가 DB에 접속하지 못합니다. 이 줄을 지우면 `POSTGRES_*` 값으로 자동 구성됩니다.

DB 비밀번호는 DB 볼륨이 처음 만들어질 때 정해집니다. 이미 실행한 뒤 `.env`의 비밀번호만 바꾸면 접속에 실패하므로, 데이터를 버려도 되면 `docker compose down -v` 후 다시 실행하고, 아니면 DB 안에서 `ALTER USER`로 먼저 바꿉니다.

운영에서는 `APP_ENV=production`, `SESSION_COOKIE_SECURE=true`, 실제 HTTPS origin(`PUBLIC_ORIGIN`)을 설정해야 합니다. production에서는 시크릿 키가 32자 미만이거나 기본값(`development...`, `.env.example`의 `replace-with-...`)이면 시작되지 않습니다.

Cloudflare Tunnel은 `.env`에 `CLOUDFLARE_TUNNEL_TOKEN`을 넣고 `docker compose --profile tunnel up -d`로 실행합니다. 토큰은 cloudflared 컨테이너에만 전달됩니다.

### 3. 데모 데이터 (seed)

기능별로 확인할 수 있는 데모 데이터를 넣을 수 있습니다. 관리자 계정은 만들지 않으므로 첫 설정 화면도 그대로 시험할 수 있습니다. 슬러그가 모두 `demo-`로 시작하고, 이미 있는 항목은 건너뛰므로 여러 번 실행해도 됩니다.

```bash
docker compose exec api python -m app.cli seed-demo
```

`.env`에 `SEED_DEMO_DATA=true`를 넣거나 `SEED_DEMO_DATA=true docker compose up -d`로 실행하면 API가 시작할 때 자동으로 넣습니다.

| 데이터 | 확인할 기능 |
|---|---|
| 작가 프로필 `데모 작가` | 헤더·홈·소개 페이지 표시 (프로필이 이미 있으면 유지) |
| 시리즈 2개 | 작품 목록 시리즈 필터 |
| `demo-morning-light` | 공개·판매 중·가격 공개 |
| `demo-layered-surface` | 가격 비공개, 세로 이미지 |
| `demo-night-window` | 판매 완료 |
| `demo-moving-light` | 영상 변환(4초 테스트 영상) |
| `demo-no-media` | 미디어 없는 작품 |
| `demo-draft-study` | 비공개 작품 — 공개 화면에 없어야 함 |
| `demo-trashed-work` | 휴지통 작품 — 어디에도 없어야 함 |
| 전시 3개 | 진행 중·지난 전시 공개, 비공개 전시 숨김 |
| 문의 2건 | API 문서의 관리자 문의 조회 |

이미지와 영상은 원본으로 저장된 뒤 media-worker가 실제 업로드와 같은 방식으로 변환하므로, 몇 초~수십 초 뒤에 화면에 나타납니다.

화면에서 따라 해 볼 수 있는 시나리오는 [docs/test-scenarios.html](docs/test-scenarios.html)을 브라우저로 열어 확인합니다.

### 4. 관리자 계정을 `.env`로 설정

웹 화면 대신 `.env`로 관리자 계정을 정할 수 있습니다.

```dotenv
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=10자-이상의-비밀번호
```

- API가 시작할 때마다 이 값을 반영합니다. 계정이 없으면 만들고, 비밀번호가 다르면 새 비밀번호로 바꾸면서 기존 로그인 세션을 모두 취소합니다.
- 값을 바꾼 뒤에는 `docker compose up -d`로 API를 다시 시작하면 반영됩니다. 비밀번호를 잊었을 때도 이 방법으로 재설정합니다.
- 계정이 생기므로 첫 관리자 설정 화면은 나오지 않습니다. 이미 웹 화면에서 만든 관리자가 있으면 그 계정은 그대로 두고 `.env` 계정이 추가됩니다.
- 둘 중 하나만 넣거나, 이메일 형식이 틀리거나, 비밀번호가 10자 미만이면 API가 시작되지 않습니다. 원인은 `docker compose logs api`에서 확인합니다.
- 비밀번호에 `$`가 들어가면 Docker Compose가 변수로 해석하므로 `ADMIN_PASSWORD='pa$$word...'`처럼 작은따옴표로 감쌉니다.
- 비밀번호가 평문으로 남으므로 `.env`를 저장소에 올리지 마세요(`.gitignore`에 포함되어 있음).

## 로컬 개발

API와 프론트를 직접 띄워 코드 변경을 바로 확인하는 방식입니다. 마이그레이션이 SQLite를 지원하지 않으므로 PostgreSQL이 필요하며, 개발용 DB만 Docker로 띄웁니다. 영상 변환을 시험하려면 `ffmpeg`(`ffprobe` 포함)도 설치해야 합니다.

API는 실행한 폴더(`apps/api`)의 `.env`만 읽고 루트 `.env`는 읽지 않습니다. 그래서 아래처럼 환경 변수로 지정합니다. `PUBLIC_ORIGIN`을 Vite 주소로 맞추지 않으면 로그인 후 등록·수정 요청이 Origin 검사에 막힙니다.

```bash
docker run -d --name artist-dev-db -p 127.0.0.1:5432:5432 \
  -e POSTGRES_DB=artist -e POSTGRES_USER=artist -e POSTGRES_PASSWORD=dev \
  postgres:17.6-alpine

cd apps/api
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
export DATABASE_URL=postgresql+psycopg://artist:dev@localhost:5432/artist
export PUBLIC_ORIGIN=http://localhost:5173
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
```

다른 터미널에서 `cd apps/web && npm ci && npm run dev`를 실행하고 `http://localhost:5173`에 접속하면 관리자 설정 화면이 나옵니다. Vite가 `/api` 요청을 `localhost:8000`으로 전달합니다. 미디어 변환 worker는 같은 환경 변수를 지정한 터미널에서 `.venv/bin/python -m app.worker`로 실행합니다. 로컬 개발에서는 업로드 파일이 `apps/api/storage`에 저장되지만, Vite는 `/media` 요청을 `localhost:8080`(Docker gateway)으로 보내므로 변환된 이미지·영상이 화면에 보이지 않습니다. 미디어 표시는 Docker Compose 실행으로 확인합니다.

## 저장 제한 기본값

- 파일당 5 GiB, 총 100 GiB
- 디스크 최소 잔여 공간 5 GiB
- 임시 업로드 만료 24시간
- 미디어 변환 동시 실행 1개

서버 용량에 맞게 `.env`에서 변경합니다. 관리자는 작품을 만든 뒤 사진·영상을 재개 가능한 청크 방식으로 올릴 수 있습니다. 이미지는 너비 800/1600/2400px의 JPEG/WebP, 영상은 포스터 이미지와 가로 1920px 이하 H.264 MP4로 변환됩니다. 작품을 삭제하면 휴지통으로 옮겨지기만 하고, `TRASH_RETENTION_DAYS` 설정은 있지만 기간이 지난 항목을 자동으로 지우는 기능은 아직 없습니다. HDR은 SDR 변환 후 BT.709 태그를 검증하며 검증 실패 시 성공 처리하지 않습니다. 구체적인 상태는 [진행표](docs/progress.md)를 확인하세요.

## DB 스키마

테이블 정의(DDL)는 [docs/db/schema.sql](docs/db/schema.sql)에 있습니다. 마이그레이션(`apps/api/alembic/versions`)에서 자동으로 만든 파일이므로, 마이그레이션을 추가한 뒤에는 아래 명령으로 다시 만듭니다. DB에 접속하지 않고 SQL만 생성합니다.

```bash
cd apps/api
DATABASE_URL=postgresql+psycopg://x:x@localhost/x .venv/bin/alembic upgrade head --sql > ../../docs/db/schema.sql
```

실행 중인 DB에서 직접 보려면 `docker compose exec db psql -U artist -d artist -c '\d+ artworks'`처럼 확인합니다.

## 테스트

```bash
cd apps/api && .venv/bin/pytest
npm --prefix apps/web run build
npm --prefix apps/web audit
docker compose config --quiet
```

PostgreSQL 동시성 통합 테스트와 Playwright E2E는 후속 단계에서 추가합니다.
