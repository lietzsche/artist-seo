-- 초기 스키마. 현재 PostgreSQL 스키마(apps/api/migrations)의 최종본을 SQLite로 옮겼다.
-- 시각은 UTC ISO8601 문자열, 불리언은 0/1이다.

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_admin_sessions_admin_id ON admin_sessions (admin_id);
CREATE INDEX ix_admin_sessions_expires_at ON admin_sessions (expires_at);

CREATE TABLE login_attempts (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_login_attempts_locked_until ON login_attempts (locked_until);

CREATE TABLE artist_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  cv TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  headline_en TEXT NOT NULL DEFAULT '',
  intro_en TEXT NOT NULL DEFAULT '',
  bio_en TEXT NOT NULL DEFAULT '',
  cv_en TEXT NOT NULL DEFAULT '',
  location_en TEXT NOT NULL DEFAULT '',
  bank_name TEXT NOT NULL DEFAULT '',
  bank_account TEXT NOT NULL DEFAULT '',
  bank_holder TEXT NOT NULL DEFAULT '',
  payment_note TEXT NOT NULL DEFAULT '',
  payment_note_en TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE artworks (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  year INTEGER,
  medium TEXT NOT NULL DEFAULT '',
  dimensions TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_text TEXT,
  title_en TEXT NOT NULL DEFAULT '',
  medium_en TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  price_text_en TEXT,
  show_price INTEGER NOT NULL DEFAULT 0 CHECK (show_price IN (0, 1)),
  sale_status TEXT NOT NULL DEFAULT 'unavailable' CHECK (sale_status IN ('unavailable', 'available', 'sold')),
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  series_id TEXT REFERENCES series (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX ix_artworks_is_published ON artworks (is_published);
CREATE INDEX ix_artworks_deleted_at ON artworks (deleted_at);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  artwork_id TEXT NOT NULL REFERENCES artworks (id) ON DELETE CASCADE,
  backend TEXT NOT NULL DEFAULT 'r2' CHECK (backend IN ('r2', 'r2-public')),  -- 원본이 있는 버킷: r2=비공개, r2-public=공개(영상)
  original_key TEXT NOT NULL UNIQUE,
  public_key TEXT UNIQUE,      -- 화면에 쓰는 파일 (이미지: 대표 WebP, 영상: 재생 파일)
  poster_key TEXT UNIQUE,      -- 영상 포스터
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT,                 -- 영상은 S5 결과에 따라 NULL일 수 있다
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  source_is_hdr INTEGER NOT NULL DEFAULT 0 CHECK (source_is_hdr IN (0, 1)),  -- 이전 후에는 항상 0 (프론트 호환용)
  hdr_to_sdr INTEGER NOT NULL DEFAULT 0 CHECK (hdr_to_sdr IN (0, 1)),        -- 이전 후에는 항상 0 (프론트 호환용)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX ix_media_assets_artwork_id ON media_assets (artwork_id);
CREATE INDEX ix_media_assets_deleted_at ON media_assets (deleted_at);

CREATE TABLE media_jobs (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_assets (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,          -- process_image
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_media_jobs_media_id ON media_jobs (media_id);
CREATE INDEX ix_media_jobs_status ON media_jobs (status);

CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  artwork_id TEXT NOT NULL REFERENCES artworks (id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,              -- 업로드 시작 때 미리 정한 미디어 ID
  original_filename TEXT NOT NULL,
  declared_content_type TEXT NOT NULL,
  expected_bytes INTEGER NOT NULL,
  received_bytes INTEGER NOT NULL DEFAULT 0,
  r2_bucket TEXT NOT NULL CHECK (r2_bucket IN ('originals', 'public')),
  r2_key TEXT NOT NULL UNIQUE,
  r2_upload_id TEXT NOT NULL,
  chunk_lock_until TEXT,               -- 청크 처리 중 표시 (동시 요청 방지, 60초 후 만료)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_upload_sessions_admin_id ON upload_sessions (admin_id);
CREATE INDEX ix_upload_sessions_artwork_id ON upload_sessions (artwork_id);
CREATE INDEX ix_upload_sessions_status ON upload_sessions (status);
CREATE INDEX ix_upload_sessions_expires_at ON upload_sessions (expires_at);

CREATE TABLE upload_parts (
  upload_id TEXT NOT NULL REFERENCES upload_sessions (id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (upload_id, part_number)
);

CREATE TABLE exhibitions (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start_date TEXT,            -- YYYY-MM-DD
  end_date TEXT,
  description TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  venue_en TEXT NOT NULL DEFAULT '',
  location_en TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_exhibitions_is_published ON exhibitions (is_published);

CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,
  artwork_id TEXT REFERENCES artworks (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  consent INTEGER NOT NULL CHECK (consent IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'new',
  fingerprint TEXT NOT NULL,
  created_bucket TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX ix_inquiries_artwork_id ON inquiries (artwork_id);
CREATE INDEX ix_inquiries_fingerprint_created_at ON inquiries (fingerprint, created_at);
