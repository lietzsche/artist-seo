-- 문의 연속 제한을 "같은 이메일·접속 위치는 시간 구간당 1건"(DB 고유 제약)에서
-- "최근 1시간에 3건까지"(서버에서 개수 확인)로 바꾼다. 관리자가 삭제한 문의는 세지 않는다.

ALTER TABLE inquiries DROP CONSTRAINT IF EXISTS uq_inquiry_rate_bucket;
CREATE INDEX IF NOT EXISTS ix_inquiries_fingerprint_created_at ON inquiries (fingerprint, created_at);
