"""PORDASI news scraper — EQIndex Step 3.

Collects Indonesian equestrian event discovery (title/date/venue hints/article URL)
from the fully-open PORDASI updates listing into raw_results (kind='news').
This feeds EVENT SEEDS — full round data still comes via EO CSV (Step 2).

Usage:
  ingest/.venv/bin/python ingest/scrapers/pordasi_news.py --pages 1
  ingest/.venv/bin/python ingest/scrapers/pordasi_news.py --pages 2 --category all
"""
import argparse
import os
import re
import sys

import psycopg
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from normalize import slug  # noqa: E402
from scrapers.base import polite_get, store_raw  # noqa: E402

LISTING = "https://pordasi.id/updates/"
CATEGORY = "https://pordasi.id/category/updates/equestrian/"
DATE_RE = re.compile(r"\d{1,2} \w+ \d{4}")


def load_dotenv(path=".env"):
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


def page_url(base, n):
    return base if n == 1 else f"{base.rstrip('/')}/page/{n}/"


def parse_card(card):
    body = card.select_one("div.card-body")
    if not body:
        return None
    title = body.select_one("h3.card-title")
    link = body.select_one("a.stretched-link[href]")
    if not title or not link:
        return None
    excerpt = body.select_one("p.card-text")
    cat = card.select_one("a[href*='/category/updates/']")
    date_m = DATE_RE.search(card.get_text(" ", strip=True))
    return {
        "kind": "news",
        "title": title.get_text(strip=True),
        "url": link["href"],
        "category": cat.get_text(strip=True) if cat else None,
        "date": date_m.group(0) if date_m else None,
        "excerpt": excerpt.get_text(strip=True)[:500] if excerpt else None,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=1)
    ap.add_argument("--category", default="equestrian", choices=["equestrian", "all"])
    ap.add_argument("--db-url", default=None)
    args = ap.parse_args()
    load_dotenv()
    db_url = args.db_url or os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set (see .env)")

    base = CATEGORY if args.category == "equestrian" else LISTING
    stats = {"fetched": 0, "inserted": 0, "skipped": 0}
    with psycopg.connect(db_url) as conn:
        for n in range(1, args.pages + 1):
            url = page_url(base, n)
            soup = BeautifulSoup(polite_get(url).text, "html.parser")
            cards = soup.select("div.update__card")
            if not cards:
                break
            with conn.transaction():
                with conn.cursor() as cur:
                    for card in cards:
                        item = parse_card(card)
                        if not item:
                            continue
                        stats["fetched"] += 1
                        rid = store_raw(cur, "PORDASI", "pordasi-news", "news",
                                        slug(item["url"]), item)
                        stats["inserted" if rid else "skipped"] += 1
    print(f"pages={args.pages} cards={stats['fetched']} "
          f"inserted={stats['inserted']} skipped_dup={stats['skipped']}")


if __name__ == "__main__":
    main()
