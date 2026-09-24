"""ESNZ series-link discovery — EQIndex Step 3.

Fetches ONLY the public ESNZ index page (robots-allowed) and records outbound
evoevents series links as raw_results (kind='series_link') for operator follow-up.

Deliberately does NOT follow into /results/*/class/ or /results/horse pages:
those are Disallow in evoevents robots.txt AND hammering them harms a small
community site. Per-round NZ data must come via EO CSV / official export.

Usage:
  ingest/.venv/bin/python ingest/scrapers/esnz_series.py
"""
import argparse
import os
import sys

import psycopg
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from normalize import slug  # noqa: E402
from scrapers.base import polite_get, store_raw  # noqa: E402

INDEX = ("https://www.nzequestrian.org.nz/disciplines/jumping-show-hunter/"
         "competitions/series-leader-boards/")


def load_dotenv(path=".env"):
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-url", default=None)
    args = ap.parse_args()
    load_dotenv()
    db_url = args.db_url or os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set (see .env)")

    soup = BeautifulSoup(polite_get(INDEX).text, "html.parser")
    links = [(a.get_text(strip=True), a["href"])
             for a in soup.select("a[href*='evoevents.co.nz/resultClass']")
             if a.get_text(strip=True)]
    stats = {"inserted": 0, "skipped": 0}
    with psycopg.connect(db_url) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                for name, url in links:
                    rid = store_raw(cur, "ESNZ", "esnz-index", "series", slug(url),
                                    {"kind": "series_link", "series": name, "url": url})
                    stats["inserted" if rid else "skipped"] += 1
    print(f"links={len(links)} inserted={stats['inserted']} skipped_dup={stats['skipped']}")


if __name__ == "__main__":
    main()
