# Cloudflare 도메인으로 공개하기 (Cloudflare Tunnel)

이 PC의 `8080` 포트(nginx gateway)를 Cloudflare에 등록한 도메인으로 공개합니다. Cloudflare Tunnel은 이 PC에서 Cloudflare로 나가는 연결만 쓰므로 공유기 포트포워딩, 고정 IP, 인증서 발급이 필요 없습니다. HTTPS는 Cloudflare가 처리합니다.

```text
방문자 ─HTTPS→ Cloudflare ─터널→ cloudflared 컨테이너 ─HTTP→ gateway:8080 → API·웹·미디어
```

## 1. Cloudflare 대시보드에서 터널 만들기

1. [Cloudflare 대시보드](https://dash.cloudflare.com) → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. 종류는 **Cloudflared**, 이름은 아무거나(예: `artist-portfolio`)
3. 설치 화면에서 OS는 상관없이 **Docker**를 고르고, 명령 안의 `--token` 뒤 긴 문자열(`eyJ...`)을 복사합니다. 명령 전체를 복사해도 `setup-env.sh`가 토큰만 골라냅니다. 이 화면의 설치 명령은 실행하지 않습니다(cloudflared는 compose가 띄웁니다).
4. **Public Hostname** 추가
   - Subdomain: 비우면 루트 도메인(`example.com`), 아니면 `www` 등
   - Domain: 구입한 도메인
   - Service: Type **HTTP**, URL **`gateway:8080`**

> URL을 `localhost:8080`으로 넣으면 안 됩니다. cloudflared가 컨테이너 안에서 돌기 때문에 compose 서비스 이름 `gateway`로 접근해야 합니다.

DNS 레코드(CNAME)는 Public Hostname을 저장하면 자동으로 만들어집니다. 같은 이름의 A/CNAME 레코드가 이미 있으면 저장이 실패하므로 **DNS** 메뉴에서 먼저 지웁니다.

## 2. 운영용 `.env` 만들기

```bash
scripts/setup-env.sh example.com 'eyJ...토큰...'
```

인자를 생략하면 물어봅니다. 다음 값이 자동으로 채워집니다.

| 값 | 내용 |
|---|---|
| `APP_ENV` | `production` |
| `APP_SECRET_KEY`, `POSTGRES_PASSWORD` | 새 난수 |
| `PUBLIC_ORIGIN` | `https://<도메인>` (로그인·CSRF 출처 확인에 사용) |
| `SESSION_COOKIE_SECURE` | `true` |
| `GATEWAY_BIND` | `127.0.0.1` (8080은 이 PC에서만 열리고 외부는 터널로만 접근) |
| `CLOUDFLARE_TUNNEL_TOKEN` | 입력한 토큰 |

DB 비밀번호는 DB 볼륨이 처음 만들어질 때 정해집니다. 개발용으로 실행했던 볼륨이 남아 있으면 스크립트가 경고합니다. 데이터를 버려도 되면 `docker compose down -v`로 지우고 진행합니다.

관리자 계정을 미리 정하려면 `.env`의 `ADMIN_EMAIL`, `ADMIN_PASSWORD`를 채웁니다. 비워 두면 공개 직후 첫 접속자가 관리자 설정 화면을 쓸 수 있으므로, 배포 직후 바로 계정을 만들거나 미리 채워 두는 것을 권장합니다.

## 3. 배포

```bash
scripts/deploy.sh            # 현재 코드로 빌드·실행
scripts/deploy.sh --pull     # git pull 후 배포
scripts/deploy.sh --no-backup
```

스크립트가 하는 일:

1. `.env` 점검 (production, HTTPS origin, 보안 쿠키, 토큰, 기본 비밀번호 여부)
2. (`--pull`) `git pull --ff-only`
3. DB가 떠 있으면 `backups/db-날짜.sql.gz`로 백업 (최근 10개 보관)
4. `docker compose --profile tunnel up -d --build`
5. `http://127.0.0.1:8080`과 `https://<도메인>`의 `/api/v1/health/live` 확인

컨테이너는 `restart: unless-stopped`라 PC를 재부팅해도 Docker가 켜지면 자동으로 다시 뜹니다(`sudo systemctl enable docker`).

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 도메인 접속 시 `502`/`1033` | `docker compose --profile tunnel logs cloudflared`, Public Hostname의 Service가 `HTTP` / `gateway:8080`인지 |
| 로그인 시 `403` | `.env`의 `PUBLIC_ORIGIN`이 브라우저 주소와 정확히 같은지 (`https://`, `www` 유무) |
| 로그인 후 바로 풀림 | `SESSION_COOKIE_SECURE=true`인데 `http://`로 접속한 경우. 도메인(HTTPS)으로 접속 |
| API가 계속 재시작 | `docker compose logs api` — DB 비밀번호 불일치(기존 볼륨)가 흔한 원인 |

## 백업 복원

```bash
gunzip -c backups/db-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

빈 DB에 복원해야 합니다. 업로드한 원본·파생 파일은 DB 백업에 포함되지 않고 `artist_originals`, `artist_public` 볼륨에 있습니다.

## 참고: 방문자 IP

로그인 시도 제한은 IP 기준입니다. 터널을 거치면 nginx가 보는 주소가 모두 cloudflared 컨테이너가 되므로, `infra/nginx/nginx.conf`에서 Docker 내부망(`172.16.0.0/12`)에서 온 요청에 한해 `CF-Connecting-IP` 헤더를 방문자 IP로 씁니다.
