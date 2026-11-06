#!/usr/bin/env python3
"""기존 Docker PostgreSQL 데이터를 D1에 넣을 INSERT SQL로 바꾼다 (docs/cloudflare-migration-guide.md 부록 A).

사용법: python3 apps/edge/scripts/export-postgres-to-d1.py 출력.sql [db 컨테이너 이름]
결과 확인 후: npx wrangler d1 execute artist-portfolio --remote --file 출력.sql

- 열 목록은 D1 스키마(migrations/*.sql)에 있는 것만 쓴다. 없는 열(media_jobs의 lease 등)은 버린다.
- 불리언은 0/1, 시각은 UTC ISO8601(밀리초, Z: JS toISOString과 같은 형식), 날짜는 YYYY-MM-DD.
- media_assets.backend는 local → r2로 바꾼다 (파일은 같은 키로 R2에 올린다).
- 세션, 로그인 기록, 업로드 세션은 옮기지 않는다 (이전 후 다시 로그인하면 된다).
- 만든 SQL을 메모리 SQLite에 스키마와 함께 넣어 외래키와 CHECK 제약을 먼저 검사한다.
"""
import json
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"
# 외래키 순서대로
TABLES = ["admins", "artist_profile", "series", "artworks", "exhibitions", "media_assets", "media_jobs", "inquiries"]


def psql(container: str, sql: str) -> str:
    cmd = ["docker", "exec", "-i", container, "psql", "-U", "artist", "-d", "artist", "-At", "-v", "ON_ERROR_STOP=1"]
    return subprocess.run(cmd, input=f"SET TIME ZONE 'UTC';\n{sql}", capture_output=True, text=True, check=True).stdout


def iso(value: str) -> str:
    dt = datetime.fromisoformat(value).astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def main() -> None:
    out = Path(sys.argv[1])
    container = sys.argv[2] if len(sys.argv) > 2 else "artist-portfolio-db-1"

    schema = sqlite3.connect(":memory:")
    for f in sorted(MIGRATIONS.glob("*.sql")):
        schema.executescript(f.read_text())

    lines = []
    for table in TABLES:
        d1_cols = [r[1] for r in schema.execute(f"PRAGMA table_info({table})")]
        types = dict(line.split("|", 1) for line in psql(container, (
            f"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='{table}';"
        )).split("\n") if "|" in line)
        cols = [c for c in d1_cols if c in types]
        dropped = sorted(set(types) - set(d1_cols))
        rows = json.loads(psql(container, f"SELECT coalesce(json_agg(t), '[]') FROM (SELECT * FROM {table} ORDER BY 1) t;").split("\n", 1)[1])  # 첫 줄은 SET 결과
        for row in rows:
            values = []
            for c in cols:
                v = row[c]
                if v is not None and types[c].startswith("timestamp"):
                    v = iso(v)
                if table == "media_assets" and c == "backend" and v == "local":
                    v = "r2"
                values.append(literal(v))
            lines.append(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join(values)});")
        print(f"{table}: {len(rows)}행" + (f" (버린 열: {', '.join(dropped)})" if dropped else ""), file=sys.stderr)

    sql = "\n".join(lines) + "\n"
    schema.execute("PRAGMA foreign_keys = ON")
    schema.executescript(sql)
    problems = schema.execute("PRAGMA foreign_key_check").fetchall()
    if problems:
        sys.exit(f"외래키 오류: {problems}")
    out.write_text(sql)
    print(f"{out}: {len(lines)}개 INSERT, 로컬 스키마 검사 통과", file=sys.stderr)


if __name__ == "__main__":
    main()
