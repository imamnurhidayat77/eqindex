"""One-time seed: parse a previously saved ESNZ standings page into series_standings.

Used because evoevents blocks bot UAs at the edge (HTTP 403) — no repeat
fetching. Ongoing NZ data must come via EO export/permission.
Reuses the production parser so the seed matches scraper output exactly.

Usage:
  ingest/.venv/bin/python ingest/scrapers/seed_standings_file.py <html-file> <page-url>
"""
import os
import sys

import psycopg
from psycopg.types.json import Json

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from normalize import normalize_name, slug  # noqa: E402
from scrapers.base import store_raw  # noqa: E402
from scrapers.esnz_standings import parse  # noqa: E402


def load_dotenv(path=".env"):
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


def main():
    path, url = sys.argv[1], sys.argv[2]
    load_dotenv()
    rows = parse(url, open(path).read())
    n = 0
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                for r in rows:
                    rid = slug(f"{r['series_key']}-{r['rider_name']}-{r['horse_name']}")
                    store_raw(cur, "ESNZ", f"esnz-{r['series_key']}", "standings", rid,
                              {"kind": "standing", **r})
                    cur.execute(
                        """INSERT INTO series_standings
                             (series_key, series_name, event_name, season, rider_name, horse_name,
                              normalized_rider, normalized_horse, total_points, points,
                              source, source_result_id)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ESNZ',%s)
                           ON CONFLICT (source, source_result_id) DO NOTHING""",
                        (r["series_key"], r["series_name"], r["event_name"], r["season"],
                         r["rider_name"], r["horse_name"],
                         normalize_name(r["rider_name"]), normalize_name(r["horse_name"]),
                         r["total_points"], Json(r["points"]), rid),
                    )
                    n += 1
    print(f"rows={len(rows)} stored={n}")


if __name__ == "__main__":
    main()
