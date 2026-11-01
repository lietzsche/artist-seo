# apps/edge: Cloudflare Worker (Hono + D1 + R2)

웹 화면(`apps/web` 빌드 결과), API(`/api/v1/*`), 공개 미디어(`/media/*`)를 Worker 하나로 서빙한다. 기존 `apps/api`(FastAPI)와 같은 API 경로와 JSON 모양을 유지한다.

- 구현 명세: [docs/cloudflare-migration-guide.md](../../docs/cloudflare-migration-guide.md)
- 배포와 git push 자동 배포 설정: [docs/cloudflare-deploy-guide.html](../../docs/cloudflare-deploy-guide.html)

배포하려고 소스를 고칠 필요는 없다. `wrangler.jsonc`에는 계정마다 다른 값을 적지 않았다.
- D1, R2: ID 없이 이름만 적었다. 첫 배포 때 Wrangler가 그 이름으로 찾고, 없으면 만든다.
- `PUBLIC_ORIGIN`(사이트 주소)과 `APP_SECRET_KEY`: 대시보드 Worker → Settings → Variables and Secrets에서 넣는다(`keep_vars`로 배포해도 유지).
- 바인딩(D1, R2)은 대시보드에서 바꾸지 않는다. 배포 때마다 `wrangler.jsonc` 내용으로 되돌아간다.

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
scripts/deploy.sh       내 PC에서 직접 배포 (테스트·빌드 후 deploy-ci.sh, 운영 / staging)
scripts/deploy-ci.sh    git push 자동 배포의 배포 단계 (마이그레이션과 배포, 첫 배포면 D1·R2 생성)
```
