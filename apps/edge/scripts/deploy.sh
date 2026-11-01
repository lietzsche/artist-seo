#!/usr/bin/env bash
# 내 PC에서 직접 배포할 때 쓴다. git push 자동 배포(Workers Builds)는 npm run deploy:ci 를 쓴다.
#   운영:     bash scripts/deploy.sh
#   스테이징: bash scripts/deploy.sh staging
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_ARGS=()
DB_NAME=artist-portfolio
if [[ "${1:-}" == "staging" ]]; then
  ENV_ARGS=(--env staging)
  DB_NAME=artist-portfolio-staging
fi

npm ci
npm run typecheck
npm test
npm run build:web                                              # ../web/dist 생성
npx wrangler d1 time-travel info "$DB_NAME" "${ENV_ARGS[@]}"   # 되돌릴 시점(bookmark)을 로그에 남긴다
npx wrangler d1 migrations apply "$DB_NAME" --remote "${ENV_ARGS[@]}"
npx wrangler deploy "${ENV_ARGS[@]}"
echo "배포 완료. 확인: curl -fsS https://<도메인>/api/v1/health/ready"
