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

## 로컬 개발

필요 도구는 Node.js 22 이상, Python 3.12, Docker Compose입니다.

```bash
cp .env.example .env
cd apps/api
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/alembic upgrade head
.venv/bin/python -m app.cli create-admin admin@example.test
.venv/bin/uvicorn app.main:app --reload
```

다른 터미널에서 `cd apps/web && npm ci && npm run dev`를 실행합니다.

## Docker Compose

`.env.example`을 `.env`로 복사한 뒤 비밀번호와 `APP_SECRET_KEY`를 바꿉니다. 운영에서는 `APP_ENV=production`, `SESSION_COOKIE_SECURE=true`, 실제 HTTPS origin을 설정해야 합니다.

```bash
npm --prefix apps/web ci
npm --prefix apps/web run build
docker compose build
docker compose run --rm api alembic upgrade head
docker compose run --rm api python -m app.cli create-admin admin@example.com
docker compose up -d
```

접속 주소는 `http://localhost:8080`, API 문서는 `/api/v1/docs`입니다. DB 포트는 호스트에 공개하지 않습니다. Cloudflare Tunnel은 `docker compose --profile tunnel up -d`로 선택 실행하며 토큰은 `.env`에만 둡니다.

## 저장 제한 기본값

- 파일당 5 GiB, 총 100 GiB
- 디스크 최소 잔여 공간 5 GiB
- 임시 업로드 만료 24시간
- 휴지통 보존 30일
- 미디어 변환 동시 실행 1개

서버 용량에 맞게 `.env`에서 변경합니다. 관리자는 작품을 만든 뒤 사진·영상을 재개 가능한 청크 방식으로 올릴 수 있습니다. 이미지 변환은 동작하지만 영상 변환은 아직 실패 상태로 명확히 기록됩니다. 구체적인 상태는 [진행표](docs/progress.md)를 확인하세요.

## 테스트

```bash
cd apps/api && .venv/bin/pytest
npm --prefix apps/web run build
npm --prefix apps/web audit
docker compose config --quiet
```

PostgreSQL 동시성 통합 테스트와 Playwright E2E는 후속 단계에서 추가합니다.
