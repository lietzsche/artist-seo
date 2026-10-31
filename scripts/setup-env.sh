#!/usr/bin/env bash
# 운영(Cloudflare Tunnel) 배포용 .env를 만든다.
# 사용법: scripts/setup-env.sh [도메인] [터널 토큰]
#   인자를 생략하면 물어본다. 이미 .env가 있으면 덮어쓰지 않는다.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  echo "이미 .env가 있습니다. 덮어쓰지 않습니다." >&2
  echo "새로 만들려면 기존 파일을 옮긴 뒤 다시 실행하세요: mv .env .env.bak" >&2
  exit 1
fi

if docker volume inspect artist-portfolio_artist_db >/dev/null 2>&1; then
  echo "경고: 기존 DB 볼륨(artist-portfolio_artist_db)이 있습니다." >&2
  echo "  새 DB 비밀번호는 기존 DB에 적용되지 않아 API가 DB에 접속하지 못합니다." >&2
  echo "  데이터를 버려도 되면 'docker compose down -v' 후 다시 실행하세요." >&2
  read -r -p "그래도 계속할까요? [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1
fi

domain="${1:-}"
token="${2:-}"
if [[ -z "$domain" ]]; then
  read -r -p "공개 도메인 (예: artist.example.com): " domain
fi
domain="${domain#https://}"
domain="${domain#http://}"
domain="${domain%%/*}"
if [[ -z "$domain" ]]; then
  echo "도메인이 비어 있습니다." >&2
  exit 1
fi
if [[ -z "$token" ]]; then
  read -r -s -p "Cloudflare Tunnel 토큰 (입력이 화면에 보이지 않음): " token
  echo
fi
# 대시보드에서 설치 명령 전체를 붙여 넣은 경우 토큰만 남긴다
token="${token##* }"
if [[ -z "$token" ]]; then
  echo "터널 토큰이 비어 있습니다." >&2
  exit 1
fi

rand() { openssl rand -hex "$1" 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex($1))"; }
secret_key="$(rand 32)"
db_password="$(rand 24)"

umask 077
sed \
  -e "s|^APP_ENV=.*|APP_ENV=production|" \
  -e "s|^APP_SECRET_KEY=.*|APP_SECRET_KEY=${secret_key}|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_password}|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql+psycopg://artist:${db_password}@db:5432/artist|" \
  -e "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=https://${domain}|" \
  -e "s|^SESSION_COOKIE_SECURE=.*|SESSION_COOKIE_SECURE=true|" \
  -e "s|^GATEWAY_BIND=.*|GATEWAY_BIND=127.0.0.1|" \
  -e "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=${token}|" \
  .env.example > .env

echo ".env를 만들었습니다 (권한 600)."
echo "  PUBLIC_ORIGIN=https://${domain}"
echo "  8080 포트는 이 PC(127.0.0.1)에서만 열리고, 외부에는 터널로만 공개됩니다."
echo "관리자 계정을 미리 정하려면 .env의 ADMIN_EMAIL/ADMIN_PASSWORD를 채우세요."
echo "다음 단계: scripts/deploy.sh"
