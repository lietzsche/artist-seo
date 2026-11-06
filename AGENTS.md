# 프로젝트 작업 지침

- 프로젝트 관련 변경 요청을 받으면 요청한 작업을 구현한다.
- 변경 후에는 관련 테스트 또는 적절한 검증을 실행하고 결과를 확인한다.
- 검증이 완료되면 변경 사항을 커밋하고 원격 저장소에 푸시한다.
- 커밋 메시지는 반드시 한국어로 작성한다.
- 사용자가 별도로 지시한 경우에는 해당 지시를 우선한다.

## 스킬

- 공통 원본은 `skills/<이름>/SKILL.md`에 두고, `.claude/skills/<이름>/SKILL.md`(Claude Code)와 `.agents/skills/<이름>/SKILL.md`(Codex)에는 원본을 읽도록 하는 진입점만 둔다.
- 사용자가 `/grill-me`, `grill-me` 또는 요구사항 인터뷰를 요청하면 `skills/grill-me/SKILL.md`를 읽고 따른다.
- 사용자가 `make-plan` 또는 실행 계획 작성을 요청하거나 grill-me 요약 뒤 계획으로 이어가기를 고르면 `skills/make-plan/SKILL.md`를 읽고 따른다. 계획 작성은 구현 승인이 아니다.
