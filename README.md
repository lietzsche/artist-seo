# 현대미술 작가 포트폴리오

한 명의 작가를 위한 포트폴리오·온라인 전시·판매 문의 서비스입니다. 현재는 첫 완성본을 향해 구현 중이며, 공개 페이지와 서버 세션 인증, 작품/문의 CRUD의 기반이 연결되어 있습니다. 실존 작가나 작품을 사용하지 않고 교체 가능한 가상 작가 `서윤`을 사용합니다.

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
- `docs`: 운영·이전·진행 문서

## 필요 도구

- Node.js 22 이상, Docker와 Docker Compose
- 로컬 개발 시 Python 3.12 추가

현재 사용자에게 Docker 권한이 없으면 `permission denied ... docker.sock` 오류가 납니다. 이때는 아래 명령 후 다시 로그인합니다.

```bash
sudo usermod -aG docker $USER
```

## Docker Compose로 실행 (권장)

### 1. 환경 설정

```bash
cp .env.example .env
openssl rand -hex 32   # 출력값을 APP_SECRET_KEY에 넣기
```

`.env`에서 아래 값을 바꿉니다.

- `APP_SECRET_KEY`: 위에서 만든 64자 난수. `openssl`이 없으면 `python3 -c "import secrets; print(secrets.token_hex(32))"`
- `POSTGRES_PASSWORD`: DB 비밀번호
- `DATABASE_URL`: 안의 비밀번호(`change-me` 부분)를 `POSTGRES_PASSWORD`와 같은 값으로 변경. 다르면 API가 DB에 접속하지 못합니다.

운영에서는 `APP_ENV=production`, `SESSION_COOKIE_SECURE=true`, 실제 HTTPS origin(`PUBLIC_ORIGIN`)을 설정해야 합니다. production에서는 32자 미만이거나 기본값인 시크릿 키로는 시작되지 않습니다.

### 2. 빌드와 실행

```bash
npm --prefix apps/web ci
npm --prefix apps/web run build
docker compose build
docker compose run --rm api alembic upgrade head
docker compose run --rm api python -m app.cli create-admin admin@example.com
docker compose up -d
```

`create-admin`은 관리자 비밀번호를 입력받습니다. 접속 주소는 `http://localhost:8080`, API 문서는 `/api/v1/docs`, 관리자 화면은 `/admin`입니다. 아직 예제 데이터가 없어 처음에는 작품 목록이 비어 있으니 관리자로 로그인해 작품을 등록합니다. 프론트 코드를 바꾸면 `npm --prefix apps/web run build`를 다시 실행해야 반영됩니다.

종료는 `docker compose down`, 로그 확인은 `docker compose logs -f api`입니다. DB 포트는 호스트에 공개하지 않습니다. Cloudflare Tunnel은 `docker compose --profile tunnel up -d`로 선택 실행하며 토큰은 `.env`에만 둡니다.

관리자 비밀번호를 바꾸면 기존 세션도 모두 취소됩니다.

```bash
docker compose run --rm api python -m app.cli reset-password admin@example.com
```

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
.venv/bin/python -m app.cli create-admin admin@example.test
.venv/bin/uvicorn app.main:app --reload
```

다른 터미널에서 `cd apps/web && npm ci && npm run dev`를 실행하고 `http://localhost:5173`에 접속합니다. Vite가 `/api` 요청을 `localhost:8000`으로 전달합니다. 미디어 변환 worker는 같은 환경 변수를 지정한 터미널에서 `.venv/bin/python -m app.worker`로 실행합니다.

## 저장 제한 기본값

- 파일당 5 GiB, 총 100 GiB
- 디스크 최소 잔여 공간 5 GiB
- 임시 업로드 만료 24시간
- 휴지통 보존 30일
- 미디어 변환 동시 실행 1개

서버 용량에 맞게 `.env`에서 변경합니다. 관리자는 작품을 만든 뒤 사진·영상을 재개 가능한 청크 방식으로 올릴 수 있습니다. 이미지는 반응형 JPEG/WebP, 영상은 포스터와 1080p 이하 MP4로 변환됩니다. HDR은 SDR 변환 후 BT.709 태그를 검증하며 검증 실패 시 성공 처리하지 않습니다. 구체적인 상태는 [진행표](docs/progress.md)를 확인하세요.

## 테스트

```bash
cd apps/api && .venv/bin/pytest
npm --prefix apps/web run build
npm --prefix apps/web audit
docker compose config --quiet
```

PostgreSQL 동시성 통합 테스트와 Playwright E2E는 후속 단계에서 추가합니다.
