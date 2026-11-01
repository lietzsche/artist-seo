#!/usr/bin/env bash
# git push 자동 배포(Workers Builds)의 Deploy command. 내 PC 배포(scripts/deploy.sh)도 마지막에 이것을 부른다.
#   운영:     bash scripts/deploy-ci.sh
#   스테이징: bash scripts/deploy-ci.sh staging
#
# D1을 대시보드에서 미리 만들 필요가 없다. 첫 배포 때 wrangler deploy가 wrangler.jsonc의 이름으로 D1, R2를 만든다.
# - DB가 이미 있으면: 마이그레이션 → 배포 (새 코드가 새 테이블 구조를 기대하므로 이 순서가 안전하다)
# - DB가 아직 없으면(첫 배포): 배포(이때 DB 생성) → 마이그레이션
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_ARGS=()
DB_NAME=artist-portfolio
if [[ "${1:-}" == "staging" ]]; then
  ENV_ARGS=(--env staging)
  DB_NAME=artist-portfolio-staging
fi

# DB가 없을 때만 "첫 배포"로 본다. 로그인, 권한 같은 다른 오류는 그대로 멈춘다
if info=$(npx wrangler d1 info "$DB_NAME" "${ENV_ARGS[@]}" 2>&1); then
  exists=1
elif grep -qi "couldn't find" <<<"$info"; then
  exists=0
else
  echo "$info" >&2
  exit 1
fi

if [[ $exists == 1 ]]; then
  npx wrangler d1 time-travel info "$DB_NAME" "${ENV_ARGS[@]}" || true   # 되돌릴 시점(bookmark)을 로그에 남긴다
  npx wrangler d1 migrations apply "$DB_NAME" --remote "${ENV_ARGS[@]}"
  npx wrangler deploy "${ENV_ARGS[@]}"
else
  echo "D1 '$DB_NAME'이 아직 없어서 배포하면서 만듭니다 (첫 배포)."
  npx wrangler deploy "${ENV_ARGS[@]}"
  npx wrangler d1 migrations apply "$DB_NAME" --remote "${ENV_ARGS[@]}"
fi
