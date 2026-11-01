# apps/edge: Cloudflare Worker (Hono + D1 + R2)

웹 화면(`apps/web` 빌드 결과), API(`/api/v1/*`), 공개 미디어(`/media/*`)를 Worker 하나로 서빙한다. 기존 `apps/api`(FastAPI)와 같은 API 경로와 JSON 모양을 유지한다.

- 구현 명세: [docs/cloudflare-migration-guide.md](../../docs/cloudflare-migration-guide.md)
- 배포와 git push 자동 배포 설정: [docs/cloudflare-deploy-guide.html](../../docs/cloudflare-deploy-guide.html)

## 로컬 개발

Node.js 22 이상이 필요하다.

```bash
cd apps/edge
npm ci
cat > .dev.vars <<'VARS'
APP_SECRET_KEY=dev-only-secret-change-me-0000000000
PUBLIC_ORIGIN=http://localhost:8787
SESSION_COOKIE_SECURE=false
VARS
npm run db:migrate:local                         # 로컬 D1에 스키마 적용
npm run build:web                                # 화면 빌드 (../web/dist)
npm run dev                                      # http://localhost:8787
npm run create-admin -- owner@example.com --local   # 관리자 만들기 (다른 터미널에서)
```

화면을 고치면서 볼 때는 `npm run dev`를 띄운 채 `npm run dev:web`(Vite, http://localhost:5173)을 쓴다. Vite가 `/api`, `/media`를 8787로 보낸다.

로컬 D1과 R2는 `.wrangler/`에 저장된다(커밋하지 않음). 로컬 Images는 저충실도 모드라 크기와 형식만 바뀐다.

## 확인

```bash
npm run typecheck
npm test            # 로컬 D1, R2에서 API 테스트 (Images는 대역)
```

## 구조

```text
src/index.ts            라우팅, 오류 형식, Cron
src/routes/             health·profile·manifest, auth, 작품·시리즈·전시, 문의, 미디어 업로드, 서버 현황, 공개 미디어
src/media/              파일 형식 판별, 이미지 파생본(Images 바인딩)
src/lib/                세션·CSRF, Argon2id, 응답 변환, 공통 함수
migrations/             D1 스키마 (번호순으로 적용)
scripts/create-admin.mjs  관리자 생성과 비밀번호 재설정
scripts/deploy.sh       내 PC에서 직접 배포 (운영 / staging)
```
