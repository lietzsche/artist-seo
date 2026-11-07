-- 2단계 카테고리 (최상위 → 하위). 시리즈와 별개로 관리자가 만들고, 작품마다 하나를 고른다
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories (id),  -- 비어 있으면 최상위. 하위가 있는 최상위는 앱에서 삭제를 막는다
  name TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 같은 위치(같은 상위)에 같은 이름을 막는다. 최상위끼리도 막도록 빈 상위를 ''로 본다
CREATE UNIQUE INDEX ux_categories_parent_name ON categories (COALESCE(parent_id, ''), name);
CREATE INDEX ix_categories_parent ON categories (parent_id);

ALTER TABLE artworks ADD COLUMN category_id TEXT REFERENCES categories (id) ON DELETE SET NULL;
CREATE INDEX ix_artworks_category ON artworks (category_id);
