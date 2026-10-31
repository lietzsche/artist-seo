#!/usr/bin/env bash
# Cloudflare Tunnel로 공개하는 운영 배포 스크립트.
# 사용법: scripts/deploy.sh [--pull] [--no-backup]
#   --pull       배포 전에 git pull --ff-only로 최신 코드를 받는다
#   --no-backup  배포 전 DB 백업(backups/)을 건너뛴다
set -euo pipefail

cd "$(dirname "$0")/.."

pull=false
backup=true
for arg in "$@"; do
  case "$arg" in
    --pull) pull=true ;;
    --no-backup) backup=false ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "알 수 없는 옵션: $arg" >&2; exit 1 ;;
  esac
done

fail() { echo "오류: $*" >&2; exit 1; }
env_value() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }

# 1. 설정 점검
[[ -f .env ]] || fail ".env가 없습니다. 먼저 scripts/setup-env.sh를 실행하세요."
[[ "$(env_value APP_ENV)" == "production" ]] || fail ".env의 APP_ENV가 production이 아닙니다."
[[ "$(env_value SESSION_COOKIE_SECURE)" == "true" ]] || fail ".env의 SESSION_COOKIE_SECURE가 true가 아닙니다."
origin="$(env_value PUBLIC_ORIGIN)"
[[ "$origin" == https://* ]] || fail ".env의 PUBLIC_ORIGIN이 https:// 주소가 아닙니다: $origin"
[[ -n "$(env_value CLOUDFLARE_TUNNEL_TOKEN)" ]] || fail ".env의 CLOUDFLARE_TUNNEL_TOKEN이 비어 있습니다."
[[ "$(env_value POSTGRES_PASSWORD)" != "change-me" ]] || fail "POSTGRES_PASSWORD가 기본값(change-me)입니다."
docker info >/dev/null 2>&1 || fail "Docker에 접속할 수 없습니다. (권한: sudo usermod -aG docker \$USER 후 재로그인)"

compose() { docker compose --profile tunnel "$@"; }

# 2. 최신 코드
if $pull; then
  echo "==> git pull"
  git pull --ff-only
fi

# 3. DB 백업 (DB가 떠 있을 때만)
if $backup && [[ -n "$(compose ps -q --status running db 2>/dev/null)" ]]; then
  mkdir -p backups
  file="backups/db-$(date +%Y%m%d-%H%M%S).sql.gz"
  echo "==> DB 백업: $file"
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$file"
  # 최근 10개만 남긴다
  ls -1t backups/db-*.sql.gz | tail -n +11 | xargs -r rm --
fi

# 4. 빌드·실행
echo "==> 이미지 빌드 및 컨테이너 시작"
if ! compose up -d --build --remove-orphans; then
  compose logs --tail 20 api
  if compose logs api 2>/dev/null | grep -q "password authentication failed"; then
    echo "원인: DB 볼륨이 예전 비밀번호로 만들어져 있습니다." >&2
    echo "  데이터를 버려도 되면: docker compose --profile tunnel down -v 후 다시 배포" >&2
  fi
  fail "컨테이너 시작 실패"
fi

# 5. 상태 확인
echo "==> 로컬 상태 확인 (http://127.0.0.1:8080)"
ok=false
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1:8080/api/v1/health/live; then ok=true; break; fi
  sleep 3
done
$ok || { compose ps; compose logs --tail 50 api gateway; fail "로컬 상태 확인 실패"; }
echo "    로컬 OK"

echo "==> 공개 주소 확인 ($origin)"
ok=false
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "$origin/api/v1/health/live"; then ok=true; break; fi
  sleep 3
done
if $ok; then
  echo "    공개 주소 OK"
else
  compose logs --tail 30 cloudflared
  echo "경고: 공개 주소에 접속하지 못했습니다. Cloudflare 대시보드의 Public Hostname 설정" >&2
  echo "      (Service: HTTP / gateway:8080)과 위 cloudflared 로그를 확인하세요." >&2
  exit 1
fi

compose ps
echo "배포 완료: $origin"
