# 구현 진행표

마지막 갱신: 2026-10-30

## 완료

- 모노레포, Compose gateway/api/worker/db, 영속 볼륨, 선택적 cloudflared profile
- `/api/v1` FastAPI와 live/readiness 분리
- PostgreSQL/SQLAlchemy 모델 기반: 관리자·세션·작품·시리즈·미디어·작업·문의
- Argon2 비밀번호, 서버 저장·취소 가능한 세션, HttpOnly 쿠키, CSRF/Origin 검사
- 공개 작품 목록/상세와 문의 저장 API, 관리자 작품 기본 CRUD, 휴지통 필드
- 스트리밍 `Storage` 계약, 안전한 LocalStorage, S3 호환 구현
- React 공개 홈/작품/상세/소개/문의와 관리자 로그인·기본 등록 화면
- 동일 출처 Nginx, 공개 파생본과 비공개 원본 볼륨 분리
- 예약 용량을 계산하는 재개 가능 순차 청크 업로드, 위치 조회·취소·재시도 UI
- 확장자/MIME 대신 Pillow·ffprobe로 실제 형식 확인, 원본 SHA-256 기록
- 관리자 전용 원본 다운로드, 단일 HTTP Range와 private/no-store 응답
- 이미지 EXIF 방향 반영, ICC→sRGB 변환, 메타데이터를 제거한 JPEG/WebP 파생본
- 800/1600/2400px 설정과 원본보다 확대하지 않는 멱등 이미지 worker 처리
- 1080p 이하 H.264/AAC MP4 영상, JPEG 포스터, 자동 재생 없는 공개 플레이어
- HDR 전달함수 감지, zscale/tonemap SDR 변환 및 BT.709 출력 태그 검증
- worker CPU·메모리·시간 제한, lease heartbeat, 종료 시 FFmpeg 프로세스 그룹 정리

## 구현 중 / 미완료

- 공개 예제 seed
- 업로드 만료 정리와 병렬 요청 스트레스 검증, 관리자 용량 현황
- HDR 샘플을 이용한 시각적 톤매핑 품질 검수와 다양한 MOV/WebM 호환성 시험
- worker heartbeat·실제 처리·멱등 완료·중단 자식 프로세스 정리
- 관리자 미디어/시리즈/전시/문의/사용량 UI와 키보드 정렬
- 다중 Range와 공개 미디어의 세밀한 응답 헤더
- 보존기간 정리, 참조 보호, Local→R2 검증 이전 CLI
- 동적 sitemap와 작품별 초기 HTML 메타데이터 사전 렌더링
- PostgreSQL 동시성 통합 테스트, Playwright 전체 흐름, 재시작/복구 시험
- 백업·복원 및 Linux 설치/업데이트/롤백 운영 문서

현재 worker는 변환 작업을 성공 처리하지 않고 명시적 실패로 남깁니다. 실제 변환 구현 전 가짜 성공 상태를 만들지 않기 위한 의도된 동작입니다.

## 실제 검증 결과

2026-10-30 기준:

- `pytest`: 8개 통과 (인증/CSRF, 비공개 차단, 작품 생성, 문의 제한, 저장소, 청크 재개·SHA-256·원본 Range, 이미지 파생본)
- `npm run build`: TypeScript와 Vite 프로덕션 빌드 통과
- `npm audit --audit-level=moderate`: 취약점 0건
- `docker compose config --quiet`: 통과
- API 컨테이너 이미지 빌드: 통과, FFmpeg 포함
- PostgreSQL 17 컨테이너에서 `alembic upgrade head`: 통과
- FFmpeg 생성 640×360 H.264/AAC 샘플: 재생본·포스터 생성 및 ffprobe 재검증 통과
- FFmpeg heartbeat 경로를 사용한 320×180 추가 샘플 변환 통과

아직 브라우저/Playwright, 실제 HDR 촬영본, 서비스 재시작 후 복구는 검증하지 않았습니다.

