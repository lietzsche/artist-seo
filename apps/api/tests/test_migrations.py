import os
import re
import uuid
from pathlib import Path
import pytest
from sqlalchemy import create_engine, text
from app import migrate
from app.models import Base

STRUCTURE_WORDS = {"PRIMARY", "FOREIGN", "UNIQUE", "CONSTRAINT", "CHECK"}


def _schema_from_sql() -> dict[str, dict[str, bool]]:
    """마이그레이션 파일을 순서대로 읽어 {테이블: {컬럼: NULL 허용 여부}}를 만든다."""
    tables: dict[str, dict[str, bool]] = {}
    for item in migrate.discover():
        sql = re.sub(r"--[^\n]*", "", item.sql)
        for statement in (s.strip() for s in sql.split(";")):
            if m := re.match(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+) \((.*)\)$", statement, re.S | re.I):
                columns = {}
                for line in (x.strip().rstrip(",") for x in m.group(2).splitlines()):
                    if line and line.split()[0].upper() not in STRUCTURE_WORDS:
                        columns[line.split()[0]] = "NOT NULL" not in line.upper()
                tables[m.group(1)] = columns
            elif m := re.match(r"ALTER TABLE (\w+) ADD COLUMN (?:IF NOT EXISTS )?(\w+)(.*)$", statement, re.S | re.I):
                tables[m.group(1)][m.group(2)] = "NOT NULL" not in m.group(3).upper()
            elif m := re.match(r"ALTER TABLE (\w+) DROP COLUMN (?:IF EXISTS )?(\w+)", statement, re.I):
                tables[m.group(1)].pop(m.group(2))
            elif m := re.match(r"ALTER TABLE (\w+) RENAME COLUMN (\w+) TO (\w+)", statement, re.I):
                tables[m.group(1)][m.group(3)] = tables[m.group(1)].pop(m.group(2))
            elif m := re.match(r"ALTER TABLE (\w+) ALTER COLUMN (\w+) (SET|DROP) NOT NULL", statement, re.I):
                tables[m.group(1)][m.group(2)] = m.group(3).upper() == "DROP"
            elif m := re.match(r"ALTER TABLE (\w+) RENAME TO (\w+)", statement, re.I):
                tables[m.group(2)] = tables.pop(m.group(1))
            elif m := re.match(r"DROP TABLE (?:IF EXISTS )?(\w+)", statement, re.I):
                tables.pop(m.group(1))
    return tables


def test_migration_files_follow_rules():
    files = migrate.discover()
    assert files and files[0].path.name == "01_init.sql"


def test_sql_migrations_match_models():
    from_sql = _schema_from_sql()
    from_models = {
        name: {column.name: bool(column.nullable) for column in table.columns}
        for name, table in Base.metadata.tables.items()
    }
    assert set(from_sql) == set(from_models), "SQL 마이그레이션과 모델의 테이블 목록이 다릅니다"
    for name in from_models:
        assert from_sql[name] == from_models[name], f"{name} 테이블의 컬럼 또는 NULL 허용 여부가 모델과 다릅니다"


# 아래는 실제 PostgreSQL이 있을 때만 실행한다. 예: TEST_POSTGRES_URL=postgresql+psycopg://user@localhost:5432/postgres
POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")
needs_postgres = pytest.mark.skipif(not POSTGRES_URL, reason="TEST_POSTGRES_URL이 없어 PostgreSQL 테스트를 건너뜀")


@pytest.fixture
def empty_database():
    admin = create_engine(POSTGRES_URL, isolation_level="AUTOCOMMIT")
    name = f"migrate_test_{uuid.uuid4().hex[:8]}"
    with admin.connect() as conn:
        conn.execute(text(f"CREATE DATABASE {name}"))
    engine = create_engine(POSTGRES_URL.rsplit("/", 1)[0] + f"/{name}")
    yield engine
    engine.dispose()
    with admin.connect() as conn:
        conn.execute(text(f"DROP DATABASE {name} WITH (FORCE)"))
    admin.dispose()


@needs_postgres
def test_apply_once_and_record(empty_database):
    assert migrate.migrate(empty_database) == [m.path.name for m in migrate.discover()]
    assert migrate.migrate(empty_database) == []
    with empty_database.connect() as conn:
        tables = set(conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).scalars())
    assert tables == set(Base.metadata.tables) | {"schema_migrations"}


@needs_postgres
def test_failed_file_is_rolled_back_and_edits_are_rejected(empty_database, tmp_path: Path):
    (tmp_path / "01_init.sql").write_bytes((migrate.MIGRATIONS_DIR / "01_init.sql").read_bytes())
    (tmp_path / "02_broken.sql").write_text("ALTER TABLE artworks ADD COLUMN temp_col TEXT;\nSELECT * FROM no_such_table;\n")
    with pytest.raises(Exception):
        migrate.migrate(empty_database, migrate.discover(tmp_path))
    with empty_database.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM information_schema.columns WHERE column_name='temp_col'")).scalar() == 0
        assert list(conn.execute(text("SELECT filename FROM schema_migrations")).scalars()) == ["01_init.sql"]
    (tmp_path / "02_broken.sql").unlink()
    (tmp_path / "01_init.sql").write_text((migrate.MIGRATIONS_DIR / "01_init.sql").read_text() + "\n-- 수정\n")
    with pytest.raises(SystemExit, match="이미 적용된"):
        migrate.migrate(empty_database, migrate.discover(tmp_path))


def test_filename_rules(tmp_path: Path):
    (tmp_path / "01_init.sql").write_text("")
    (tmp_path / "03_skip.sql").write_text("")
    with pytest.raises(SystemExit, match="빠짐없이"):
        migrate.discover(tmp_path)
    (tmp_path / "03_skip.sql").unlink()
    (tmp_path / "2 bad.sql").write_text("")
    with pytest.raises(SystemExit, match="규칙"):
        migrate.discover(tmp_path)
