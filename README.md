# 현대미술 작가 포트폴리오

한 명의 작가를 위한 포트폴리오·온라인 전시·판매 문의 서비스입니다. 공개 페이지(영어 기본, 한국어 `/ko`), 서버 세션 인증과 첫 관리자 설정, 작품·문의·시리즈·전시 관리, 이어 올리기가 되는 미디어 업로드와 이미지 변환이 연결되어 있습니다. 작가 이름과 소개는 코드에 고정되어 있지 않고 관리자 화면의 **작가 프로필**에서 설정합니다.

## 구조

Cloudflare Worker 하나가 화면, API, 공개 미디어를 모두 서빙합니다.

```text
브라우저 → Cloudflare Worker (apps/edge, Hono)
             ├→ 화면: apps/web 빌드 결과 (정적 파일)
             ├→ /api/v1 → D1 (SQLite)
             └→ /media  → R2 공개 버킷 (파생본)
                          R2 비공개 버킷 (원본), Images (이미지 변환)
```

- `apps/web`: React + TypeScript + Vite + React Router + TanStack Query
- `apps/edge`: Cloudflare Worker (Hono + D1 + R2). 로컬 개발, 구조, 관리자 만들기는 [apps/edge/README.md](apps/edge/README.md)
- `docs`: 배포·이전·진행 문서, [수동 테스트 시나리오](docs/test-scenarios.html)

## 배포

`git push`하면 Cloudflare가 자동으로 빌드·배포합니다. 대시보드 Builds의 Deploy command가 `npm run deploy:ci`여야 DB 마이그레이션도 함께 적용됩니다(첫 배포면 D1·R2도 만듦). 기본값 `npx wrangler deploy`로 두면 `npx wrangler d1 migrations apply artist-portfolio --remote`를 직접 실행해야 합니다. 배포하려고 소스를 고칠 필요는 없고, 사이트 주소(`PUBLIC_ORIGIN`)와 `APP_SECRET_KEY`는 Cloudflare 대시보드에서 넣습니다. 처음 설정하는 방법은 [Cloudflare 자동 배포 가이드](docs/cloudflare-deploy-guide.html)를 봅니다.

## 로컬 실행

Node.js 22 이상이 필요합니다. 자세한 내용은 [apps/edge/README.md](apps/edge/README.md)에 있습니다.

```bash
cd apps/edge
npm ci
npm run db:migrate:local
npm run build:web
npm run dev                                          # http://localhost:8787
npm run create-admin -- owner@example.com --local    # 관리자 만들기 (다른 터미널에서)
```

관리자를 만들지 않고 접속하면 어느 페이지로 들어가도 **관리자 계정 설정** 화면(`/admin`)이 나옵니다. 이 화면은 첫 관리자를 만들 때 한 번만 쓸 수 있으므로, 운영 사이트는 공개 전에 먼저 계정을 만들어 두세요.

## 작품 추가하기

`/admin`에 로그인하면 **작품 · 문의 · 작가 프로필 · 시리즈·전시 · 서버 현황** 탭이 있습니다. 화면 안의 **사용 가이드**(`/guide`)에 자세한 설명이 있습니다.

1. **작품** 탭의 '새 작품'에 제목을 넣고 **작품 만들기**를 누릅니다. 비공개로 만들어지고 편집기가 바로 열립니다.
2. 편집기에서 **사진·영상 올리기**로 파일을 고릅니다(여러 개 가능, 큰 파일은 이어 올리기 지원).
3. 재료, 크기, 설명, 시리즈, 판매 상태, 가격을 채웁니다. 가격 공개를 끄면 사이트에 '문의'로 표시됩니다.
4. **사이트에 공개**를 켜고 저장하면 작품 페이지(`/works`)에 나타납니다. 작품 페이지는 최근 작품부터 12점씩 나뉩니다. **대표 작품**을 켜면 홈에도 나옵니다.

## 저장 제한 기본값

`apps/edge/wrangler.jsonc`의 `vars`에 있습니다.

- 사진 한 장 20 MiB, 파일 하나 5 GiB, 원본 전체 100 GiB (staging은 10 GiB)
- 임시 업로드 만료 24시간
- 로그인 시도 15분에 5회

구체적인 상태는 [진행표](docs/progress.md)를 확인하세요.

## DB 스키마와 마이그레이션

D1 스키마는 `apps/edge/migrations`의 번호 붙은 SQL 파일로 관리합니다. 배포할 때 아직 적용하지 않은 파일이 번호 순서대로 적용됩니다.

1. 다음 번호로 새 파일을 만듭니다(예: `0002_artworks_add_xxx.sql`).
2. 이미 적용된 파일은 고치지 않습니다. 수정할 내용도 새 번호 파일로 추가합니다.
3. 로컬에서는 `npm run db:migrate:local`로 적용합니다.

## 테스트

```bash
cd apps/edge
npm run typecheck
npm test                       # 로컬 D1·R2로 API 테스트
npm --prefix ../web run build  # 화면 타입 검사와 빌드
```
