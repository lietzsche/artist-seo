-- 01_init.sql — 초기 스키마
--
-- 기존 Alembic 마이그레이션(초기 스키마 ~ 작가 프로필)을 하나로 합친 시작점이다.
-- 이미 Alembic으로 만들어진 DB에도 안전하게 실행되도록 IF NOT EXISTS를 쓴다.
-- 02번부터는 일반적인 SQL로 작성하면 된다.

-- 관리자 ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(36) NOT NULL,
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(512) NOT NULL,
    is_active BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_admins_email ON admins (email);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id VARCHAR(36) NOT NULL,
    admin_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    csrf_token VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_admin_sessions_admin_id ON admin_sessions (admin_id);
CREATE INDEX IF NOT EXISTS ix_admin_sessions_expires_at ON admin_sessions (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS ix_admin_sessions_token_hash ON admin_sessions (token_hash);

-- 로그인 시도 제한 (IP·이메일 조합의 해시 기준)
CREATE TABLE IF NOT EXISTS login_attempts (
    key_hash VARCHAR(64) NOT NULL,
    attempts INTEGER NOT NULL,
    window_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_until TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (key_hash)
);
CREATE INDEX IF NOT EXISTS ix_login_attempts_locked_until ON login_attempts (locked_until);

-- 작가 프로필 (id=1 한 행만 사용) --------------------------------------

CREATE TABLE IF NOT EXISTS artist_profile (
    id INTEGER NOT NULL,
    name VARCHAR(120) NOT NULL,
    headline VARCHAR(300) NOT NULL,
    intro TEXT NOT NULL,
    bio TEXT NOT NULL,
    cv TEXT NOT NULL,
    location VARCHAR(120) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ck_artist_profile_single_row CHECK (id = 1)
);

-- 시리즈·작품 -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS series (
    id VARCHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (name)
);

DO $$ BEGIN
    CREATE TYPE salestatus AS ENUM ('unavailable', 'available', 'sold');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS artworks (
    id VARCHAR(36) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    title VARCHAR(300) NOT NULL,
    year INTEGER,
    medium VARCHAR(300) NOT NULL,
    dimensions VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    price_text VARCHAR(100),
    show_price BOOLEAN NOT NULL,
    sale_status salestatus NOT NULL,
    is_published BOOLEAN NOT NULL,
    featured BOOLEAN NOT NULL,
    series_id VARCHAR(36),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,  -- 휴지통으로 옮긴 시각
    PRIMARY KEY (id),
    FOREIGN KEY (series_id) REFERENCES series (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_artworks_deleted_at ON artworks (deleted_at);
CREATE INDEX IF NOT EXISTS ix_artworks_is_published ON artworks (is_published);
CREATE UNIQUE INDEX IF NOT EXISTS ix_artworks_slug ON artworks (slug);

-- 미디어 ---------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE mediastatus AS ENUM ('pending', 'processing', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS media_assets (
    id VARCHAR(36) NOT NULL,
    artwork_id VARCHAR(36) NOT NULL,
    backend VARCHAR(40) NOT NULL,
    original_key VARCHAR(500) NOT NULL,   -- 비공개 원본 저장 경로
    public_key VARCHAR(500),              -- 공개 파생본 경로 (변환 후 채워짐)
    original_filename VARCHAR(500) NOT NULL,
    media_type VARCHAR(20) NOT NULL,      -- image | video
    content_type VARCHAR(100) NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    status mediastatus NOT NULL,
    sort_order INTEGER NOT NULL,
    is_primary BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    poster_key VARCHAR(500),              -- 영상 포스터 이미지 경로
    source_is_hdr BOOLEAN DEFAULT false NOT NULL,
    hdr_to_sdr BOOLEAN DEFAULT false NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (artwork_id) REFERENCES artworks (id) ON DELETE CASCADE,
    UNIQUE (original_key),
    UNIQUE (public_key),
    CONSTRAINT uq_media_assets_poster_key UNIQUE (poster_key)
);
CREATE INDEX IF NOT EXISTS ix_media_assets_artwork_id ON media_assets (artwork_id);
CREATE INDEX IF NOT EXISTS ix_media_assets_deleted_at ON media_assets (deleted_at);

-- media-worker가 가져가 처리하는 변환 작업
CREATE TABLE IF NOT EXISTS media_jobs (
    id VARCHAR(36) NOT NULL,
    media_id VARCHAR(36) NOT NULL,
    kind VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL,          -- queued | running | completed | failed
    attempts INTEGER NOT NULL,
    max_attempts INTEGER NOT NULL,
    progress INTEGER NOT NULL,
    error TEXT,
    lease_owner VARCHAR(100),
    lease_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (media_id) REFERENCES media_assets (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_media_jobs_lease_expires_at ON media_jobs (lease_expires_at);
CREATE INDEX IF NOT EXISTS ix_media_jobs_media_id ON media_jobs (media_id);
CREATE INDEX IF NOT EXISTS ix_media_jobs_status ON media_jobs (status);

DO $$ BEGIN
    CREATE TYPE uploadstatus AS ENUM ('active', 'completed', 'cancelled', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 재개 가능한 청크 업로드
CREATE TABLE IF NOT EXISTS upload_sessions (
    id VARCHAR(36) NOT NULL,
    admin_id VARCHAR(36) NOT NULL,
    artwork_id VARCHAR(36) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    declared_content_type VARCHAR(100) NOT NULL,
    expected_bytes BIGINT NOT NULL,
    received_bytes BIGINT NOT NULL,
    temporary_key VARCHAR(500) NOT NULL,
    status uploadstatus NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (admin_id) REFERENCES admins (id) ON DELETE CASCADE,
    FOREIGN KEY (artwork_id) REFERENCES artworks (id) ON DELETE CASCADE,
    UNIQUE (temporary_key)
);
CREATE INDEX IF NOT EXISTS ix_upload_sessions_admin_id ON upload_sessions (admin_id);
CREATE INDEX IF NOT EXISTS ix_upload_sessions_artwork_id ON upload_sessions (artwork_id);
CREATE INDEX IF NOT EXISTS ix_upload_sessions_status ON upload_sessions (status);
CREATE INDEX IF NOT EXISTS ix_upload_sessions_expires_at ON upload_sessions (expires_at);

-- 전시 -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exhibitions (
    id VARCHAR(36) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    title VARCHAR(300) NOT NULL,
    venue VARCHAR(300) NOT NULL,
    location VARCHAR(300) NOT NULL,
    start_date DATE,
    end_date DATE,
    description TEXT NOT NULL,
    is_published BOOLEAN NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_exhibitions_slug ON exhibitions (slug);
CREATE INDEX IF NOT EXISTS ix_exhibitions_is_published ON exhibitions (is_published);

-- 구매 문의 ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inquiries (
    id VARCHAR(36) NOT NULL,
    artwork_id VARCHAR(36),
    name VARCHAR(120) NOT NULL,
    email VARCHAR(320) NOT NULL,
    message TEXT NOT NULL,
    consent BOOLEAN NOT NULL,
    status VARCHAR(30) NOT NULL,
    fingerprint VARCHAR(64) NOT NULL,     -- IP·이메일 해시 (연속 문의 제한용)
    created_bucket VARCHAR(20) NOT NULL,  -- 시간 단위 구간 (YYYYMMDDHH)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    FOREIGN KEY (artwork_id) REFERENCES artworks (id) ON DELETE SET NULL,
    CONSTRAINT uq_inquiry_rate_bucket UNIQUE (fingerprint, created_bucket)
);
CREATE INDEX IF NOT EXISTS ix_inquiries_artwork_id ON inquiries (artwork_id);
