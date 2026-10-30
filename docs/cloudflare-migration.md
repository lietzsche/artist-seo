# Cloudflare 이전 경계

현재 완성 목표는 Linux Docker Compose이며 Cloudflare 이전은 선택 사항입니다.

## 프론트만 Static Assets/Pages로 이전

`VITE_API_BASE_URL`, `VITE_MEDIA_BASE_URL`을 별도 HTTPS 주소로 빌드합니다. API에서 정확한 origin CORS, credential 허용, 쿠키 `SameSite=None; Secure`, CSRF origin을 함께 바꿔야 합니다. SPA 작품별 SNS 메타데이터는 별도 사전 렌더링/서버 페이지가 필요합니다.

## 저장소를 R2로 이전

S3 호환 endpoint로 `S3CompatibleStorage`를 구성할 수 있지만 공개 파생본과 비공개 원본 bucket 또는 권한을 분리해야 합니다. 공개 custom domain의 캐시와 관리자 원본의 비공개 서명/프록시를 혼용하지 않습니다. 이전 CLI는 dry-run→복사→SHA-256 검증→재개 순으로 구현하며 검증 전 로컬 원본을 삭제하지 않습니다.

## API·DB·worker 이전

Python Workers의 ASGI 지원은 일반 Linux CPython과 동일하지 않습니다. Pillow, FFmpeg, 로컬 디스크, subprocess, PostgreSQL 드라이버와 상주 worker를 그대로 옮긴다고 가정하지 않습니다. 네이티브 미디어 worker는 Linux에 남기거나 호환 실행 환경을 별도로 선택해야 합니다.

D1은 PostgreSQL 설정 교체가 아니며 스키마·쿼리·마이그레이션을 다시 설계해야 합니다. Containers 또한 Compose 전체의 직접 배포나 로컬 디스크 영속성을 보장하지 않으므로 DB, 원본 저장, 작업 실행의 영속 경계를 외부 서비스로 분리해야 합니다. R2·Workers·Containers의 사용량 과금은 월 고정 상한으로 표현하지 않고 실제 요금표와 사용량을 검토합니다.
