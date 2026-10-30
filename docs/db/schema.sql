-- PostgreSQL DDL (자동 생성 파일, 직접 수정하지 마세요)
-- 원본: apps/api/alembic/versions 의 마이그레이션 전체를 순서대로 적용한 결과
-- 다시 만들기: cd apps/api && DATABASE_URL=postgresql+psycopg://x:x@localhost/x .venv/bin/alembic upgrade head --sql > ../../docs/db/schema.sql (DB 접속 없이 SQL만 생성)

BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> ec7f67fe57b1

CREATE TABLE admins (
    id VARCHAR(36) NOT NULL, 
    email VARCHAR(320) NOT NULL, 
    password_hash VARCHAR(512) NOT NULL, 
    is_active BOOLEAN NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_admins_email ON admins (email);

CREATE TABLE series (
    id VARCHAR(36) NOT NULL, 
    name VARCHAR(200) NOT NULL, 
    description TEXT NOT NULL, 
    sort_order INTEGER NOT NULL, 
    PRIMARY KEY (id), 
    UNIQUE (name)
);

CREATE TABLE admin_sessions (
    id VARCHAR(36) NOT NULL, 
    admin_id VARCHAR(36) NOT NULL, 
    token_hash VARCHAR(64) NOT NULL, 
    csrf_token VARCHAR(64) NOT NULL, 
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    revoked_at TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(admin_id) REFERENCES admins (id) ON DELETE CASCADE
);

CREATE INDEX ix_admin_sessions_admin_id ON admin_sessions (admin_id);

CREATE INDEX ix_admin_sessions_expires_at ON admin_sessions (expires_at);

CREATE UNIQUE INDEX ix_admin_sessions_token_hash ON admin_sessions (token_hash);

CREATE TYPE salestatus AS ENUM ('unavailable', 'available', 'sold');

CREATE TABLE artworks (
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
    deleted_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(series_id) REFERENCES series (id) ON DELETE SET NULL
);

CREATE INDEX ix_artworks_deleted_at ON artworks (deleted_at);

CREATE INDEX ix_artworks_is_published ON artworks (is_published);

CREATE UNIQUE INDEX ix_artworks_slug ON artworks (slug);

CREATE TABLE inquiries (
    id VARCHAR(36) NOT NULL, 
    artwork_id VARCHAR(36), 
    name VARCHAR(120) NOT NULL, 
    email VARCHAR(320) NOT NULL, 
    message TEXT NOT NULL, 
    consent BOOLEAN NOT NULL, 
    status VARCHAR(30) NOT NULL, 
    fingerprint VARCHAR(64) NOT NULL, 
    created_bucket VARCHAR(20) NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    deleted_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (id), 
    FOREIGN KEY(artwork_id) REFERENCES artworks (id) ON DELETE SET NULL, 
    CONSTRAINT uq_inquiry_rate_bucket UNIQUE (fingerprint, created_bucket)
);

CREATE INDEX ix_inquiries_artwork_id ON inquiries (artwork_id);

CREATE TYPE mediastatus AS ENUM ('pending', 'processing', 'ready', 'failed');

CREATE TABLE media_assets (
    id VARCHAR(36) NOT NULL, 
    artwork_id VARCHAR(36) NOT NULL, 
    backend VARCHAR(40) NOT NULL, 
    original_key VARCHAR(500) NOT NULL, 
    public_key VARCHAR(500), 
    original_filename VARCHAR(500) NOT NULL, 
    media_type VARCHAR(20) NOT NULL, 
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
    PRIMARY KEY (id), 
    FOREIGN KEY(artwork_id) REFERENCES artworks (id) ON DELETE CASCADE, 
    UNIQUE (original_key), 
    UNIQUE (public_key)
);

CREATE INDEX ix_media_assets_artwork_id ON media_assets (artwork_id);

CREATE INDEX ix_media_assets_deleted_at ON media_assets (deleted_at);

CREATE TABLE media_jobs (
    id VARCHAR(36) NOT NULL, 
    media_id VARCHAR(36) NOT NULL, 
    kind VARCHAR(40) NOT NULL, 
    status VARCHAR(20) NOT NULL, 
    attempts INTEGER NOT NULL, 
    max_attempts INTEGER NOT NULL, 
    progress INTEGER NOT NULL, 
    error TEXT, 
    lease_owner VARCHAR(100), 
    lease_expires_at TIMESTAMP WITH TIME ZONE, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    FOREIGN KEY(media_id) REFERENCES media_assets (id) ON DELETE CASCADE
);

CREATE INDEX ix_media_jobs_lease_expires_at ON media_jobs (lease_expires_at);

CREATE INDEX ix_media_jobs_media_id ON media_jobs (media_id);

CREATE INDEX ix_media_jobs_status ON media_jobs (status);

INSERT INTO alembic_version (version_num) VALUES ('ec7f67fe57b1') RETURNING alembic_version.version_num;

-- Running upgrade ec7f67fe57b1 -> 41bf38de322a

CREATE TYPE uploadstatus AS ENUM ('active', 'completed', 'cancelled', 'failed');

CREATE TABLE upload_sessions (
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
    FOREIGN KEY(admin_id) REFERENCES admins (id) ON DELETE CASCADE, 
    FOREIGN KEY(artwork_id) REFERENCES artworks (id) ON DELETE CASCADE, 
    UNIQUE (temporary_key)
);

CREATE INDEX ix_upload_sessions_admin_id ON upload_sessions (admin_id);

CREATE INDEX ix_upload_sessions_artwork_id ON upload_sessions (artwork_id);

CREATE INDEX ix_upload_sessions_status ON upload_sessions (status);

CREATE INDEX ix_upload_sessions_expires_at ON upload_sessions (expires_at);

UPDATE alembic_version SET version_num='41bf38de322a' WHERE alembic_version.version_num = 'ec7f67fe57b1';

-- Running upgrade 41bf38de322a -> 57e91ce14ef0

ALTER TABLE media_assets ADD COLUMN poster_key VARCHAR(500);

ALTER TABLE media_assets ADD CONSTRAINT uq_media_assets_poster_key UNIQUE (poster_key);

ALTER TABLE media_assets ADD COLUMN source_is_hdr BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE media_assets ADD COLUMN hdr_to_sdr BOOLEAN DEFAULT false NOT NULL;

UPDATE alembic_version SET version_num='57e91ce14ef0' WHERE alembic_version.version_num = '41bf38de322a';

-- Running upgrade 57e91ce14ef0 -> d945a6f102a1

CREATE TABLE login_attempts (
    key_hash VARCHAR(64) NOT NULL, 
    attempts INTEGER NOT NULL, 
    window_started_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    locked_until TIMESTAMP WITH TIME ZONE, 
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (key_hash)
);

CREATE INDEX ix_login_attempts_locked_until ON login_attempts (locked_until);

UPDATE alembic_version SET version_num='d945a6f102a1' WHERE alembic_version.version_num = '57e91ce14ef0';

-- Running upgrade d945a6f102a1 -> 85c2a7f3b919

CREATE TABLE exhibitions (
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

CREATE UNIQUE INDEX ix_exhibitions_slug ON exhibitions (slug);

CREATE INDEX ix_exhibitions_is_published ON exhibitions (is_published);

UPDATE alembic_version SET version_num='85c2a7f3b919' WHERE alembic_version.version_num = 'd945a6f102a1';

-- Running upgrade 85c2a7f3b919 -> b3d81f0c2a47

CREATE TABLE artist_profile (
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

UPDATE alembic_version SET version_num='b3d81f0c2a47' WHERE alembic_version.version_num = '85c2a7f3b919';

COMMIT;

