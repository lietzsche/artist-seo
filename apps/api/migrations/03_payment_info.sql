-- 공개 문의 페이지에 보여줄 입금 계좌. 계좌번호가 비어 있으면 화면에 표시하지 않는다.

ALTER TABLE artist_profile ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE artist_profile ADD COLUMN IF NOT EXISTS bank_account VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE artist_profile ADD COLUMN IF NOT EXISTS bank_holder VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE artist_profile ADD COLUMN IF NOT EXISTS payment_note TEXT NOT NULL DEFAULT '';
ALTER TABLE artist_profile ADD COLUMN IF NOT EXISTS payment_note_en TEXT NOT NULL DEFAULT '';
