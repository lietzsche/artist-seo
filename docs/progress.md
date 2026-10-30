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

## 구현 중 / 미완료

- 공개 예제 seed
- 작은 업로드와 청크 재개 업로드, 예약 용량·형식 검증·취소·재시도
- Pillow 색상 관리·반응형 파생본, FFmpeg 영상/포스터/HDR 판별
- worker heartbeat·실제 처리·멱등 완료·중단 자식 프로세스 정리
- 관리자 미디어/시리즈/전시/문의/사용량 UI와 키보드 정렬
- 원본 Range 다운로드와 공개 미디어의 세밀한 응답 헤더
- 보존기간 정리, 참조 보호, Local→R2 검증 이전 CLI
- 동적 sitemap와 작품별 초기 HTML 메타데이터 사전 렌더링
- PostgreSQL 동시성 통합 테스트, Playwright 전체 흐름, 재시작/복구 시험
- 백업·복원 및 Linux 설치/업데이트/롤백 운영 문서

현재 worker는 변환 작업을 성공 처리하지 않고 명시적 실패로 남깁니다. 실제 변환 구현 전 가짜 성공 상태를 만들지 않기 위한 의도된 동작입니다.

## 실제 검증 결과

2026-10-30 기준:

- `pytest`: 6개 통과 (인증/CSRF, 비공개 차단, 작품 생성, 문의 동의·속도 제한, 저장소 스트리밍·경로 순회)
- `npm run build`: TypeScript와 Vite 프로덕션 빌드 통과
- `npm audit --audit-level=moderate`: 취약점 0건
- `docker compose config --quiet`: 통과
- API 컨테이너 이미지 빌드: 통과, FFmpeg 포함
- PostgreSQL 17 컨테이너에서 `alembic upgrade head`: 통과

아직 브라우저/Playwright, 실제 이미지·영상 변환, 서비스 재시작 후 복구는 검증하지 않았습니다.

