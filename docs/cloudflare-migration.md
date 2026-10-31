# Cloudflare 이전 검토: 현재 구성 vs Hono + D1 + R2 완전 이전

두 가지 경우만 비교한다.

- **현재 유지**: Docker Compose(FastAPI, PostgreSQL, FFmpeg worker, nginx)를 이 PC에서 돌리고 Cloudflare Tunnel로 공개한다. ([deploy-cloudflare.md](deploy-cloudflare.md))
- **완전 이전**: API는 Hono(TypeScript), DB는 D1, 파일은 R2로 옮기고 서버를 두지 않는다.

이전하기로 정하면 [cloudflare-migration-guide.md](cloudflare-migration-guide.md)(API 명세, 스키마, 설정, 작업 순서)로 바로 착수한다. 이 문서는 비교와 판단용이다.

작성 기준일은 2026-10-31이다. 요금과 한도는 바뀔 수 있으므로 이전을 시작하기 전에 공식 문서로 다시 확인한다.

## 1. 확정된 결정

| 항목 | 결정 |
|---|---|
| 스택 | Hono + D1 + R2, 프론트는 같은 Worker의 Static Assets |
| 플랜 | Workers Paid ($5/월) |
| 영상 | **변환하지 않는다.** MP4(H.264)/WebM만 받아서 올린 파일 그대로 서빙. 포스터와 길이, 크기는 관리자 브라우저가 측정 |
| 이미지 | Cloudflare Images 변환으로 800/1600/2400px의 WebP와 JPEG 파생본 생성. 원본은 20MB 이하로 제한(미정, 가이드 13절) |
| 운영 데이터 | 지금은 없음. 이전 방법은 가이드 부록 A에 보류 항목으로 정리 |
| 과금 추적 | 필수는 Cloudflare 알림 설정과 WAF 속도 제한. 앱 안의 사용량 표시는 선택(가이드 10절) |

## 2. 요약

| 항목 | 현재 유지 | 완전 이전 |
|---|---|---|
| 월 비용 | 추가 비용 없음 (PC 전기료, 회선, 도메인은 별개) | 약 $6~7 |
| 사이트 가동 | PC와 회선, Docker가 살아 있어야 함 | PC와 무관 |
| 개발 상태 | 완성, 테스트 있음 | 백엔드(API, 인증, 업로드, 설정)를 TypeScript로 다시 작성 |
| 영상 | FFmpeg 변환(H.264 CRF 23, 1920px 제한, HDR→SDR, 포스터 자동 추출) | 변환 없음. 웹용 MP4를 직접 만들어 올려야 함 |
| 이미지 | Pillow (sRGB 변환, 5GB까지) | Images 변환 (20MB까지, 색과 회전 처리는 시험 필요) |
| 백업 | DB 덤프 스크립트. 원본 파일은 볼륨 하나뿐 | D1 Time Travel 30일. R2 원본은 별도 백업 필요 |
| 벤더 종속 | 거의 없음 | 큼 (D1, R2, Images, Workers 전용 API) |
| 이전에 드는 일 | 없음 | 큼 (가이드 12절) |

이전의 실질적 이점은 **PC를 상시 켜 둘 필요가 없어지는 것** 하나다. 비용 절감 목적이라면 이전할 이유가 없다.

## 3. 구성도

### 현재 유지
```text
방문자 → Cloudflare → Tunnel → gateway(nginx) ─┬→ api(FastAPI) ─→ db(PostgreSQL)
                                               ├→ 정적 프론트 (React)
                                               └→ /media (공개 파생본)
                          media-worker(FFmpeg, Pillow) ← media_jobs 테이블 폴링
                          볼륨: originals(비공개), public, tmp
```

### 완전 이전
```text
방문자 → Cloudflare → Worker ─┬→ 프론트 (Static Assets)
                              ├→ /api/v1/* (Hono) ─→ D1
                              ├→ /media/* ─→ R2 공개 버킷 (이미지 파생본, 영상)
                              └→ 업로드 완료 시 Images로 파생본 생성 → R2 공개 버킷
                                  원본 이미지는 R2 비공개 버킷
```
프론트와 API를 같은 도메인에서 서빙하므로 쿠키, CORS, CSRF 설정이 지금과 같다.

## 4. 비용

### 4.1 요금표 (공식 문서 기준, 2026-10-31 확인)

| 서비스 | 무료 | 유료 |
|---|---|---|
| Workers | 하루 10만 요청, 요청당 CPU 10ms | **$5/월**: 월 1천만 요청, CPU 3천만 ms 포함. 초과 시 100만 요청당 $0.30, CPU 100만 ms당 $0.02 |
| 정적 자산 | 무료, 무제한 | 무료, 무제한 |
| D1 | 읽기 500만 행/일, 쓰기 10만 행/일, 저장 5GB | 읽기 250억 행/월, 쓰기 5천만 행/월, 저장 5GB 포함. 초과 시 저장 $0.75/GB |
| R2 | 저장 10GB, 쓰기 100만 건, 읽기 1천만 건 | 저장 $0.015/GB-월, 쓰기 100만 건당 $4.50, 읽기 100만 건당 $0.36, **송신 무료** |
| Images 변환 | 월 5,000건 | 5,000건 포함, 이후 1,000건당 $0.50. 같은 원본과 같은 옵션 조합은 한 달에 한 번만 센다 |

### 4.2 이 프로젝트의 월 비용 추정

| 항목 | 현재 유지 | 완전 이전 |
|---|---|---|
| Workers 유료 플랜 | 0 | $5 |
| D1 | (PostgreSQL 컨테이너) 0 | 0 (무료 한도 안) |
| R2 (원본+파생본+영상 50GB) | 0 | 약 $0.6 |
| R2 (100GB, 현재 상한) | 0 | 약 $1.4 |
| 이미지 변환 | 0 | 0 (원본 한 장당 6건이라 월 800장까지 무료) |
| 영상 | 0 | 0 (R2 용량에 포함, 송신 무료) |
| **합계** | **0** | **약 $6~7** |

- 방문자가 이미지와 영상을 볼 때마다 Worker 요청이 1건 생기지만, 월 1천만 건까지 포함이다. 월 방문자 10만 명이 20개씩 받아도 200만 건이다.
- 로그인 비밀번호 해시(Argon2)가 CPU를 쓰는 비용은 사실상 0원이다. 1회를 1초로 잡아도 월 3만 번까지 포함 범위다. 무차별 대입 공격으로 CPU가 소모되는 경우만 문제라 잠금 확인을 해시 계산 전에 하고 WAF 속도 제한을 건다(가이드 10절). 로그인 사양은 필요하면 바꿀 수 있다.
- 영상을 Stream 같은 변환 서비스에 맡기면 시청 1,000분당 $1이 붙는다. 이번 결정은 그것을 쓰지 않는 것이다.
- 현재 방식의 숨은 비용은 PC 상시 가동 전기료, 장애 대응 시간, 디스크 고장 시 복구 비용이다.
- 도메인 비용은 두 경우 모두 같다.

## 5. 리스크 비교

### 5.1 현재 유지

| # | 위험 | 영향 | 대응 |
|---|---|---|---|
| C1 | PC 전원, 회선, Docker 중단 | 사이트 전체 중단 | 자동 재시작(`restart: unless-stopped`)이 있으나 하드웨어 문제는 막지 못함 |
| C2 | 디스크 고장 | 원본 작품 파일과 DB 유실 | DB 덤프는 있으나 **원본 파일(`artist_originals`) 백업이 없음**. 외장 디스크나 R2로 주기적 복사를 추가 권장 |
| C3 | PC OS 업데이트, 재부팅 | 일시 중단 | 점검 시간 약속 |
| C4 | 업로드와 변환이 PC 자원에 의존 | 큰 영상 변환 중 다른 작업이 느려짐 | `media_worker_concurrency`와 컨테이너 자원 제한이 이미 있음 |

### 5.2 완전 이전

| # | 위험 | 영향 | 대응 |
|---|---|---|---|
| M1 | 백엔드 재작성 중 동작 차이 | 인증, 세션, CSRF, 제한 로직의 누락과 보안 허점 | 기존 pytest 시나리오를 vitest로 옮기고(가이드 11절) `docs/test-scenarios.html`로 수동 점검 |
| M2 | Argon2를 Workers에서 계산하기 어려움 | 관리자 로그인 불가 | 가이드 S1 시험. 안 되면 해시 비용을 낮추거나 scrypt로 바꾸고 관리자 비밀번호를 재설정(관리자 한 명) |
| M3 | 영상을 변환하지 않음 | HDR이나 고비트레이트 파일을 올리면 색이 바래거나 재생이 느림 | 업로드 화면에 규격 안내, 브라우저에서 재생 가능 여부를 올리기 전에 검사(가이드 7절) |
| M4 | Images 변환의 입력 20MB 제한, 색(ICC)과 EXIF 회전 처리 차이 | 큰 원본 업로드 거부, 색이나 방향이 다르게 보임 | 가이드 S2로 시험. 실제 원본 크기를 확인(미정). 문제가 되면 브라우저에서 파생본을 만드는 방식으로 변경 |
| M5 | 큰 파일 업로드(최대 5GB) | Worker 요청 본문 한도(100MB)에 걸림 | 현재 청크가 5MiB라 문제없고 R2 멀티파트와 규격이 맞음(가이드 6.1) |
| M6 | 전체 파일 SHA-256 계산 | 5GB 파일은 완료 요청이 오래 걸림 | 가이드 S5로 측정. 나쁘면 영상 해시를 생략 |
| M7 | D1은 행 잠금과 대화형 트랜잭션이 없음 | 첫 관리자 동시 생성 같은 경합 | 한 문장짜리 조건부 `INSERT`와 `batch()`(트랜잭션으로 실행됨)로 처리. 관리자가 한 명이라 실제 위험은 작음 |
| M8 | 원본 파일 백업 | R2에는 스냅샷 기능이 없어 실수로 지우면 복구가 어려움 | `rclone sync`로 주기적으로 다른 곳에 복사. D1은 Time Travel(30일) |
| M9 | 벤더 종속 | 나중에 옮기기 어려움 | DB 접근과 저장소 접근을 각각 한 모듈에 모음 |
| M10 | 요금 정책 변경, 공격으로 인한 요청 폭주 | 비용 증가 | 결제 알림, 로그인과 문의에 WAF 속도 제한, 저장 용량 상한(`MAX_TOTAL_BYTES`) |
| M11 | 전환 중 서비스 중단 | 접속 불가 | 지금 운영 데이터가 없어 위험이 작음. 기존 Docker 스택은 한 주간 중지만 하고 보관 |

## 6. 판단 기준

**현재 유지가 낫다**
- PC가 24시간 켜져 있고 가끔의 중단을 받아들일 수 있다.
- 5GB 이미지, 영상 변환(HDR 톤맵핑, 비트레이트 제어) 같은 기능을 그대로 쓰고 싶다.
- 비용 0원을 유지하고 싶다.
- 백엔드를 다시 쓸 시간이 없다.

**완전 이전이 낫다**
- 사이트가 PC와 무관하게 항상 떠 있어야 한다.
- 서버 운영(OS, Docker, 디스크)에서 벗어나고 싶다.
- 월 $6~7과 재작성 비용을 받아들일 수 있다.
- 영상 변환이 없는 것과 이미지 20MB 제한을 받아들일 수 있다.

**이전 없이 현재 방식을 보강할 수 있는 것**: 원본 파일과 DB 덤프를 R2나 외장 디스크로 주기적으로 복사하는 백업만 추가해도 C2를 크게 줄일 수 있다.

## 7. 기능 변화 한눈에

| 기능 | 현재 | 이전 후 |
|---|---|---|
| 이미지 업로드 | 최대 5GB, JPEG/PNG/WebP | 최대 20MB(기본값, 미정), 같은 형식 |
| 이미지 파생본 | 800/1600/2400px, WebP와 JPEG | 같음 (Images 변환) |
| 영상 업로드 | MP4, MOV, WebM, 최대 5GB, 서버 변환 | MP4(H.264)와 WebM만, 최대 5GB, **변환 없음** |
| 영상 HDR 처리 | 자동 SDR 변환과 색상 검증 | 없음. SDR로 내보내서 올려야 함 |
| 영상 포스터 | 서버가 추출 | 관리자 브라우저가 추출해서 올림 |
| 영상 길이, 크기 | 서버가 측정 | 관리자 브라우저가 측정 |
| 서버 현황 | 디스크 잔여, 저장 용량, 실패 작업 | 저장 용량, 실패 작업 |
| 관리자 계정 생성 | `.env`의 ADMIN_EMAIL/PASSWORD | `scripts/create-admin.mjs` |
| 데모 데이터 시드 | 있음 | 제외 |

## 8. 참고 (공식 문서)

- Workers 요금: https://developers.cloudflare.com/workers/platform/pricing/
- Workers 한도: https://developers.cloudflare.com/workers/platform/limits/
- Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/binding/
- D1 요금: https://developers.cloudflare.com/d1/platform/pricing/
- D1 batch: https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/
- R2 요금: https://developers.cloudflare.com/r2/pricing/
- R2 멀티파트: https://developers.cloudflare.com/r2/objects/multipart-objects/
- R2 Workers API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
- Images 요금: https://developers.cloudflare.com/images/pricing/
- Images 바인딩: https://developers.cloudflare.com/images/transform-images/bindings/
