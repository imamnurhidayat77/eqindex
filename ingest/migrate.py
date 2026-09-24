"""Migration runner — applies pending db/migrations/*.sql in order.

Tracks state in schema_migrations (so re-runs are safe).
Seeds (db/seeds/) are intentionally NOT handled here — run once by hand.

Usage:
  ingest/.venv/bin/python ingest/migrate.py
"""
import glob
import os
import sys

import psycopg


def load_dotenv(path=".env"):
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


def main():
    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set (see .env)")
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    files = sorted(glob.glob(os.path.join(root, "db", "migrations", "*.sql")))
    with psycopg.connect(db_url, autocommit=True) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations "
                     "(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())")
        done = {r[0] for r in conn.execute("SELECT filename FROM schema_migrations")}
        for path in files:
            name = os.path.basename(path)
            if name in done:
                print(f"skip {name}")
                continue
            sql = open(path).read()
            try:
                with conn.transaction():
                    conn.execute(sql)
                    conn.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (name,))
                print(f"applied {name}")
            except Exception as exc:  # noqa: BLE001 - stop, leave prior files applied
                print(f"FAILED {name}: {exc}")
                sys.exit(1)


if __name__ == "__main__":
    main()
