"""번호 붙은 SQL 파일(migrations/01_init.sql, 02_....sql …)을 순서대로 DB에 적용한다.

- 적용한 파일은 schema_migrations 테이블에 기록하고 다시 실행하지 않는다.
- 이미 적용한 파일의 내용이 바뀌면 멈춘다. 고칠 내용은 새 번호 파일로 추가한다.
- 파일 하나는 트랜잭션 하나로 실행되므로, 중간에 실패하면 그 파일 전체가 취소된다.

사용법: python -m app.migrate          # 적용
        python -m app.migrate --status # 적용 상태만 보기
"""
import argparse
import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from sqlalchemy import Engine, create_engine, text
from app.core.config import settings

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
FILENAME = re.compile(r"^(\d{2,})_[0-9A-Za-z가-힣_-]+\.sql$")
LOCK_ID = 7_301_240_517  # 동시에 여러 컨테이너가 적용하지 않도록 잡는 advisory lock 번호

# Alembic을 쓰던 DB를 넘겨받을 때 허용하는 마지막 리비전 (01_init.sql이 그 이후 상태를 모두 포함한다)
ALEMBIC_REVISIONS = {"85c2a7f3b919", "b3d81f0c2a47"}


@dataclass(frozen=True)
class Migration:
    version: int
    path: Path

    @property
    def sql(self) -> str:
        return self.path.read_text(encoding="utf-8")

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.path.read_bytes()).hexdigest()


def discover(directory: Path = MIGRATIONS_DIR) -> list[Migration]:
    migrations: list[Migration] = []
    for path in sorted(directory.glob("*.sql")):
        match = FILENAME.match(path.name)
        if not match:
            raise SystemExit(f"마이그레이션 파일 이름이 규칙(01_설명.sql)에 맞지 않습니다: {path.name}")
        migrations.append(Migration(int(match.group(1)), path))
    migrations.sort(key=lambda m: m.version)
    versions = [m.version for m in migrations]
    duplicates = sorted({v for v in versions if versions.count(v) > 1})
    if duplicates:
        raise SystemExit(f"같은 번호의 마이그레이션 파일이 여러 개 있습니다: {duplicates}")
    if versions and versions != list(range(1, len(versions) + 1)):
        raise SystemExit(f"마이그레이션 번호는 01부터 빠짐없이 이어져야 합니다: {versions}")
    return migrations


def _has_table(cursor, name: str) -> bool:
    cursor.execute("SELECT to_regclass(%s) IS NOT NULL", (name,))
    return bool(cursor.fetchone()[0])


def migrate(engine: Engine, migrations: list[Migration] | None = None) -> list[str]:
    migrations = discover() if migrations is None else migrations
    if engine.dialect.name != "postgresql":
        raise SystemExit("SQL 마이그레이션은 PostgreSQL에서만 실행할 수 있습니다")
    applied_now: list[str] = []
    raw = engine.raw_connection()
    cursor = raw.cursor()
    try:
        cursor.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " version INTEGER PRIMARY KEY,"
            " filename VARCHAR(200) NOT NULL,"
            " checksum VARCHAR(64) NOT NULL,"
            " applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now())"
        )
        raw.commit()
        cursor.execute("SELECT version, filename, checksum FROM schema_migrations")
        applied = {version: (filename, checksum) for version, filename, checksum in cursor.fetchall()}

        legacy = not applied and _has_table(cursor, "alembic_version")
        if legacy:
            cursor.execute("SELECT version_num FROM alembic_version")
            revision = cursor.fetchone()[0]
            if revision not in ALEMBIC_REVISIONS:
                raise SystemExit(f"이전 Alembic 리비전({revision})의 DB는 자동으로 넘겨받을 수 없습니다")
            print(f"[migrate] 이전 Alembic DB({revision})를 넘겨받습니다")

        for migration in migrations:
            if migration.version in applied:
                filename, checksum = applied[migration.version]
                if checksum != migration.checksum:
                    raise SystemExit(
                        f"이미 적용된 {filename}의 내용이 바뀌었습니다. "
                        "적용된 파일은 고치지 말고 다음 번호 파일로 변경 사항을 추가하세요"
                    )
                continue
            # 파일 전체와 기록을 한 트랜잭션으로 처리한다 (PostgreSQL은 DDL도 롤백된다)
            try:
                cursor.execute(migration.sql)
                cursor.execute(
                    "INSERT INTO schema_migrations (version, filename, checksum) VALUES (%s, %s, %s)",
                    (migration.version, migration.path.name, migration.checksum),
                )
                raw.commit()
            except Exception:
                raw.rollback()
                print(f"[migrate] 실패: {migration.path.name} (이 파일의 변경은 모두 취소됨)")
                raise
            applied_now.append(migration.path.name)

        if legacy:
            cursor.execute("DROP TABLE alembic_version")
            raw.commit()
    finally:
        raw.rollback()
        cursor.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
        raw.commit()
        cursor.close()
        raw.close()
    return applied_now


def status(engine: Engine) -> None:
    migrations = discover()
    with engine.connect() as conn:
        exists = conn.execute(text("SELECT to_regclass('schema_migrations') IS NOT NULL")).scalar()
        applied = {r.version: r for r in conn.execute(text("SELECT version, applied_at FROM schema_migrations"))} if exists else {}
    for m in migrations:
        row = applied.get(m.version)
        print(f"{'적용됨' if row else '대기  '}  {m.path.name}" + (f"  ({row.applied_at:%Y-%m-%d %H:%M})" if row else ""))


def main() -> None:
    parser = argparse.ArgumentParser(description="SQL 마이그레이션 적용")
    parser.add_argument("--status", action="store_true", help="적용 상태만 출력")
    args = parser.parse_args()
    engine = create_engine(settings.database_url)
    if args.status:
        status(engine)
        return
    applied = migrate(engine)
    print(f"[migrate] 적용: {', '.join(applied)}" if applied else "[migrate] 새로 적용할 파일 없음")


if __name__ == "__main__":
    main()
