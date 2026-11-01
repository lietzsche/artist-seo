#!/usr/bin/env bash
# 내 PC에서 직접 배포할 때 쓴다. git push 자동 배포(Workers Builds)는 같은 배포 단계(scripts/deploy-ci.sh)를 쓴다.
#   운영:     bash scripts/deploy.sh
#   스테이징: bash scripts/deploy.sh staging
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm run typecheck
npm test
npm run build:web                                              # ../web/dist 생성
bash scripts/deploy-ci.sh "${1:-}"                               # 마이그레이션과 배포 (첫 배포면 D1, R2 생성)
echo "배포 완료. 확인: curl -fsS https://<도메인>/api/v1/health/ready"
