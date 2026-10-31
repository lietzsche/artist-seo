# Cloudflare 이전 검토

현재 운영 방식은 이 PC(또는 서버)에서 Docker Compose를 돌리고 Cloudflare Tunnel로 공개하는 것이다([deploy-cloudflare.md](deploy-cloudflare.md)). 이 문서는 이것을 Cloudflare 서비스(Workers, D1, R2 등)로 옮길 때의 구성안, 비용, 위험, 작업 범위를 정리한다. 이전은 선택 사항이며 이 문서는 결정을 돕기 위한 검토 기록이다.

작성 기준일은 2026-10-31이다. 요금과 기능은 바뀔 수 있으므로 실제 이전 전에 공식 문서로 다시 확인한다. 이번에 확인하지 못한 항목은 "확인 필요"로 표시했다.

## 1. 요약

| 질문 | 답 |
|---|---|
| 전부 Cloudflare 안에서 돌릴 수 있는가 | 변환 작업(FFmpeg)을 제외하면 가능하다. 변환까지 넣으려면 Containers 같은 추가 선택이 필요하다 |
| DB 구조를 그대로 가져갈 수 있는가 | 데이터 모델은 그대로 가져간다. D1로 가면 PostgreSQL 방언(enum, 시각 타입 등)을 바꿔야 한다 |
| 비용이 더 싸지는가 | 아니다. 지금은 추가 비용이 0원이고, 이전하면 월 $5 안팎이 든다 |
| 이전의 이점은 | PC를 24시간 켜 두지 않아도 된다. 전원, 회선, 디스크 고장 부담이 사라진다 |
| 권장안 | 프론트는 Static Assets, DB는 D1, 파일은 R2로 옮기고, 변환 worker만 집이나 VPS에 남긴다 (3절 B안) |

## 2. 현재 구성

```text
방문자 → Cloudflare → Tunnel → gateway(nginx) → api(FastAPI) / 정적 파일 / 공개 미디어
                                          └→ db(PostgreSQL 17), media-worker(FFmpeg·Pillow)
```

- API: FastAPI, SQLAlchemy 동기 방식, psycopg, Argon2 비밀번호 해시, 서버 세션 쿠키
- 파일: 로컬 볼륨 `/data` (원본은 비공개, 파생본은 nginx가 공개). `S3CompatibleStorage`가 이미 있어 R2로 바꿀 수 있다
- 변환: `media_jobs` 테이블을 폴링하는 `media-worker`가 FFmpeg로 영상, Pillow로 이미지를 변환한다
- 청크 업로드로 최대 5GB 파일을 받는다 (`max_file_bytes`), 전체 상한은 100GB (`max_total_bytes`)

## 3. 구성안

### A안. 현재 유지 (Tunnel)
- 변경 없음. 비용은 전기료와 회선뿐이다.
- 단점: PC가 꺼지거나 회선이 끊기면 사이트도 멈춘다. 백업은 `scripts/deploy.sh`의 DB 덤프뿐이고, 원본 파일은 볼륨 하나에만 있다.

### B안. 부분 이전 (권장)
```text
Cloudflare: Static Assets(프론트) + Worker(API) + D1(DB) + R2(파일)
집/VPS    : media-worker 하나 (R2에서 원본을 받아 변환 후 R2에 올림)
```
- 사이트 가동이 PC 상태와 무관해진다. 변환은 업로드할 때만 필요해서 꺼져 있어도 사이트는 정상이다.
- API는 Hono(TypeScript)로 다시 쓰거나 Python Workers로 포팅한다 (5절 참고).

### C안. 완전 이전
- B안에서 변환 worker까지 Cloudflare Containers(2026-04 GA)나 Cloudflare Images/Stream으로 옮긴다.
- 서버를 완전히 없앨 수 있지만 비용이 가장 불확실하고 변환 파이프라인을 다시 설계해야 한다.

### D안. 프론트만 이전
- 프론트를 Static Assets로 옮기고 API는 그대로 둔다. 이점이 작고 CORS, 쿠키(`SameSite=None; Secure`), CSRF origin 설정이 복잡해진다. 권하지 않는다.

## 4. 비용

### 4.1 요금표 (공식 문서 기준, 2026-10-31 확인)

| 서비스 | 무료 | 유료(Workers Paid, $5/월) |
|---|---|---|
| Workers | 하루 10만 요청, 요청당 CPU 10ms | 월 1천만 요청과 CPU 3천만 ms 포함. 초과 시 100만 요청당 $0.30, CPU 100만 ms당 $0.02 |
| 정적 자산 | 무료, 무제한 | 무료, 무제한 |
| D1 | 읽기 500만 행/일, 쓰기 10만 행/일, 저장 5GB | 읽기 250억 행, 쓰기 5천만 행, 저장 5GB 포함. 초과 시 저장 $0.75/GB-월 |
| R2 | 저장 10GB, 쓰기 100만 건, 읽기 1천만 건 | 저장 $0.015/GB-월, 쓰기 100만 건당 $4.50, 읽기 100만 건당 $0.36. **송신 무료** |
| Containers | (유료 플랜 필요) | CPU는 사용한 시간만, 메모리와 디스크는 깨어 있는 동안 프로비저닝한 크기만큼 과금. 송신 $0.045/GB |
| Hyperdrive, Images, Stream | - | 이번에 확인하지 못함 (확인 필요) |

### 4.2 이 프로젝트의 예상 월 비용

| 항목 | A안 | B안 | C안 |
|---|---|---|---|
| Workers 유료 플랜 | 0 | $5 | $5 |
| D1 | 0 | 0 (무료 한도 안) | 0 |
| R2 (원본+파생본 50GB 가정) | 0 | 약 $0.6 | 약 $0.6 |
| R2 (100GB 가정, 상한) | 0 | 약 $1.4 | 약 $1.4 |
| 변환 worker | PC | PC 또는 VPS(대략 월 $4~6, 확인 필요) | Containers 사용량만큼 |
| **합계** | **전기료** | **약 $6~12** | **$6 + Containers** |

- 무료 플랜으로는 Argon2 로그인 해시를 요청당 CPU 10ms 안에 끝내기 어려워 유료 플랜을 전제로 했다 (6절 R3).
- 트래픽 비용은 거의 없다. 영상과 이미지는 R2 송신이 무료이고, 정적 프론트는 무료 무제한이다.
- D1의 읽기 한도(월 250억 행)는 포트폴리오 규모에서 닿을 수 없다. 단, 인덱스 없이 전체를 훑는 쿼리는 읽기 행이 크게 늘어나므로 목록 쿼리에는 인덱스를 유지한다.
- Containers는 상시 가동 서비스에 쓰면 일반 VPS보다 5~10배 비싸다는 분석이 있다. 업로드할 때만 기동하는 용도로 한정하면 부담이 작다. 실제 사용량으로 시험한 뒤 판단한다.

## 5. 기술 선택: API를 무엇으로 옮기는가

| | Hono(TypeScript) | Python Workers(FastAPI) |
|---|---|---|
| 상태 | 안정적 | 2026-09 GA. ASGI와 FastAPI 지원 |
| 코드 재사용 | 백엔드 약 2,200줄 재작성 | 구조는 유지하되 포팅 필요 |
| Pillow, argon2-cffi | 해당 없음 (JS 대안 사용) | Pyodide에 있어야 함. **확인 필요** |
| SQLAlchemy 2.0 + psycopg | 해당 없음 (D1 바인딩 또는 Drizzle 등) | D1 바인딩은 있으나 SQLAlchemy 동작은 **확인 필요**. Hyperdrive 경유 시 psycopg3, asyncpg, pg8000이 테스트됨 |
| 서브프로세스, 스레드, 로컬 디스크 | 없음 | 없음 (Pyodide/WASM 환경) |
| 요금 | 동일 | 동일 (언어와 무관) |

Python Workers는 일반 CPython이 아니라 Pyodide(WebAssembly) 위에서 돈다. 순수 파이썬과 PyEmscripten 휠, Pyodide 내장 패키지만 쓸 수 있다. 포팅 전에 최소 Worker로 Pillow, argon2-cffi, SQLAlchemy가 실제로 import되고 동작하는지 먼저 시험한다.

## 6. 위험

| # | 위험 | 영향 | 대응 |
|---|---|---|---|
| R1 | 변환(FFmpeg)을 Workers에서 못 돌린다 | 업로드 후 영상, 이미지가 변환되지 않음 | 변환 worker를 Linux에 남기고 R2를 통해 주고받는다(B안), 또는 Containers/Images/Stream 사용 |
| R2 | Python Workers의 패키지 호환성 불확실 (Pillow, argon2, SQLAlchemy) | 포팅이 중간에 막힘 | 시험용 최소 Worker로 먼저 검증. 실패하면 Hono로 전환 |
| R3 | Argon2는 CPU를 많이 쓰므로 CPU 시간 제한에 걸릴 수 있다 | 관리자 로그인 실패 | 유료 플랜(기본 30초, 최대 5분) 사용. JS로 가면 다른 해시로 바꿔야 해 **기존 관리자 비밀번호 해시가 호환되지 않으므로 재설정 필요** |
| R4 | D1 방언 차이 (enum, 시각, 불리언, `IF NOT EXISTS`, 잠금) | 마이그레이션 실패, 동작 차이 | 7절 변환표에 따라 새 스키마를 한 파일로 작성하고, 이전 전 복사본 DB로 리허설 |
| R5 | D1은 `SKIP LOCKED`, 행 잠금, advisory lock이 없다. 트랜잭션 지원도 제한적이다 | 변환 job 중복 처리, 첫 관리자 생성 경합 | job 선점은 `UPDATE ... WHERE status='queued' ... RETURNING`으로 원자적으로 처리. 첫 관리자는 `INSERT ... WHERE NOT EXISTS`. 여러 문장이 묶여야 하는 곳은 D1 batch 사용 (확인 필요) |
| R6 | 큰 파일 업로드 (최대 5GB) | Worker 요청 본문 크기 제한에 걸림 | 현재 청크 업로드 구조를 유지하고 청크를 작게 한다. 최종적으로 R2 멀티파트 업로드를 쓴다. 요청 본문 한도는 **확인 필요** |
| R7 | 공개 파생본과 비공개 원본의 접근 분리 | 원본이 외부에 노출될 수 있음 | 버킷을 둘로 나누고 공개 버킷에만 커스텀 도메인을 연결한다. 원본은 Worker를 통한 서명/프록시로만 읽는다 |
| R8 | SNS 공유 미리보기 (SPA는 작품별 메타 태그가 없음) | 링크 공유 시 제목, 이미지 미표시 | Worker에서 작품 페이지 요청에 메타 태그를 주입하거나 사전 렌더링. 현재 구성에도 같은 한계가 있다 |
| R9 | 방문자 IP 기반 제한 (로그인, 문의) | 제한이 모두 같은 IP로 집계됨 | Worker에서는 `CF-Connecting-IP`를 바로 쓸 수 있다. nginx의 현재 처리 로직은 불필요해진다 |
| R10 | 요금 정책 변경, 사용량 급증 | 예상보다 비용 증가 | 월 예산 알림 설정. 특히 Containers와 Images는 사용량 기준이라 상한을 직접 확인한다 |
| R11 | 벤더 종속 (D1, Workers 바인딩) | 나중에 다른 곳으로 옮기기 어려움 | DB 접근을 한 계층에 모으고, 저장소는 기존 `Storage` 인터페이스를 유지한다 |
| R12 | 이전 중 데이터 유실 | 작품, 문의, 파일 손실 | 7절 순서대로 하되 검증 전에는 기존 원본과 DB를 삭제하지 않는다 |

## 7. 데이터 이전

### 7.1 DB 변환 (PostgreSQL → D1)

테이블 11개(`admins`, `admin_sessions`, `login_attempts`, `artist_profile`, `series`, `artworks`, `media_assets`, `media_jobs`, `upload_sessions`, `exhibitions`, `inquiries`)는 모두 평범한 관계형 구조이며 JSONB, 배열, 트리거, 전문검색이 없다.

| 현재 (PostgreSQL) | D1(SQLite) |
|---|---|
| `ENUM` 3개 (`salestatus`, `mediastatus`, `uploadstatus`) | `TEXT` + `CHECK (col IN (...))` |
| `TIMESTAMP WITH TIME ZONE` | UTC ISO8601 `TEXT` |
| `BOOLEAN` | `INTEGER` 0/1 |
| `DATE` | ISO `TEXT` (`YYYY-MM-DD`) |
| `BIGINT` | `INTEGER` |
| `ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT` | 지원 안 됨. 마이그레이션 4개를 최종 스키마 하나로 합침 |
| `ilike` (`artworks.py`) | `LIKE` |
| `FOR UPDATE SKIP LOCKED` (`worker.py`) | 원자적 `UPDATE ... RETURNING` |
| `pg_advisory_lock` (`migrate.py`) | `wrangler d1 migrations` |
| `LOCK TABLE admins` (`auth.py`) | `INSERT ... WHERE NOT EXISTS` |

데이터는 `pg_dump`를 그대로 쓸 수 없다. 테이블별로 읽어 값을 변환한 `INSERT`로 넣는다. 규모가 작아 수 분이면 된다.

외부 PostgreSQL(Neon 등)을 Hyperdrive로 연결하면 스키마를 바꾸지 않아도 된다. 대신 DB가 Cloudflare 밖에 남고 그 서비스의 요금이 따로 든다 (확인 필요).

### 7.2 파일 이전 (로컬 → R2)
1. 이전 CLI를 만든다: 목록 비교(dry-run) → 복사 → SHA-256 검증 → 중단 후 재개.
2. `media_assets.sha256`이 이미 있어 원본 검증에 쓸 수 있다.
3. `media_assets.backend`와 키 체계를 유지해 DB 값을 바꾸지 않는다.
4. 검증이 끝나기 전에는 로컬 원본을 지우지 않는다.

## 8. 작업 순서 (B안 기준)

1. **시험**: 최소 Worker로 5절의 호환성 확인(Python 선택 시), D1 새 스키마 작성, 복사본 DB로 데이터 변환 리허설
2. **저장소**: R2 버킷(공개/비공개) 생성, 파일 이전 CLI, 공개 도메인 연결
3. **API**: Worker로 포팅. 인증, 세션, CSRF, 문의 제한, 작품/전시/프로필 CRUD, 청크 업로드
4. **프론트**: Static Assets 배포. API와 같은 도메인에서 서빙해 CORS와 쿠키 문제를 피한다
5. **변환 worker**: R2에서 원본을 받아 변환 후 R2에 올리도록 수정. D1의 `media_jobs`를 HTTP API로 폴링
6. **병행 운영**: 새 주소에서 `docs/test-scenarios.html`의 시나리오 전체를 점검하고 데이터 최종 동기화
7. **전환**: 도메인을 Worker로 연결(DNS 전환). 기존 Tunnel 구성은 한동안 유지해 되돌릴 수 있게 한다
8. **정리**: 문제가 없으면 기존 볼륨과 DB 백업을 보관 기간을 두고 정리

전환 직후 한 달 정도는 기존 DB 덤프와 원본 파일을 지우지 않는다.

## 9. 결정이 필요한 사항

- API 언어: Hono(TypeScript) 재작성 vs Python Workers 포팅 (5절 시험 결과로 결정)
- DB: D1 vs Hyperdrive + 외부 PostgreSQL
- 변환: 집/VPS 유지 vs Containers vs Images/Stream
- 관리자 비밀번호 해시 방식 변경을 받아들일 것인가 (JS 선택 시)

## 10. 확인하지 못한 항목

- Python Workers에서 Pillow, argon2-cffi, SQLAlchemy 2.0, boto3 동작 여부
- Worker 요청 본문 크기 제한과 5GB 업로드 처리 방식
- D1 batch 트랜잭션 의미와 제한
- Cloudflare Images, Stream, Hyperdrive 요금
- Containers의 이 프로젝트 워크로드(업로드 시 기동) 실제 비용
- VPS 요금 (업체별로 다름)
