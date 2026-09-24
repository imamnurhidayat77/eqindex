"""ESNZ series standings scraper — EQIndex analytics-from-scraping.

NOTE (Sep 2026): evoevents now returns HTTP 403 to polite bot UAs (nginx
UA block — they ask scrapers to stay away after bot traffic took the site
down). Do NOT rotate/impersonate UAs to bypass. Ongoing NZ series data must
come via EO export or partnership. For the one-time demo seed, see
seed_standings_file.py (parses an already-retrieved page, zero new traffic).

Fetches ONE public series standings page per run (robots-allowed path,
crawl-delay honoured) and stores every (rider, horse) row into
series_standings + raw_results. This is points data (not rounds):
drives series_rankings analytics, not clear-round stats.

Usage:
  ingest/.venv/bin/python ingest/scrapers/esnz_standings.py
  ingest/.venv/bin/python ingest/scrapers/esnz_standings.py --url <resultClass URL>
"""
import argparse
import os
import re
import sys

import psycopg
from bs4 import BeautifulSoup
from psycopg.types.json import Json

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from normalize import normalize_name, slug  # noqa: E402
from scrapers.base import polite_get, store_raw  # noqa: E402

DEFAULT_URL = "https://www.evoevents.co.nz/resultClass/2135883281/2146912980/-1"
SEASON_RE = re.compile(r"(\d{4}-\d{4})")


def load_dotenv(path=".env"):
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


def num(value):
    value = (value or "").strip().replace(",", "")
    if not value:
        return None
    try:
        return float(value) if "." in value else int(value)
    except ValueError:
        return None


def parse(url, html):
    soup = BeautifulSoup(html, "html.parser")
    title = soup.select_one("h1.event-hero__title")
    series_name = title.get_text(strip=True) if title else "Unknown Series"
    crumb = soup.select_one("ol.breadcrumb a[href^='/results/']")
    event_name = crumb.get_text(strip=True).replace(" — Results", "") if crumb else "Unknown Event"
    season_m = SEASON_RE.search(f"{series_name} {event_name}")
    # canonical ids from the class-jump selector (allowed page content, not fetched)
    key = "unknown"
    sel = soup.select_one("select#class-jump option[selected]")
    if sel and sel.get("value"):
        m = re.search(r"/results/(\d+)/class/(\d+)", sel["value"])
        if m:
            key = f"{m.group(1)}-{m.group(2)}"

    table = soup.select_one("table.results-scorecard")
    if not table:
        raise ValueError("standings table not found")
    heads = [th.get_text(strip=True) for th in table.select("thead tr")[-1].select("th")]
    show_names = heads[3:]  # Rider | Horse | Total | show columns...
    rows = []
    for tr in table.select("tbody tr"):
        tds = tr.select("td")
        if len(tds) < 3:
            continue
        rider = tds[0].get_text(strip=True)
        horse = tds[1].get_text(strip=True)
        if not rider or not horse:
            continue
        points = {}
        for name, td in zip(show_names, tds[3:]):
            v = num(td.get_text())
            if v is not None:
                points[name] = v
        rows.append({
            "series_key": key, "series_name": series_name, "event_name": event_name,
            "season": season_m.group(1) if season_m else None,
            "rider_name": rider, "horse_name": horse,
            "total_points": num(tds[2].get_text()) or 0,
            "points": points, "source_url": url,
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--db-url", default=None)
    args = ap.parse_args()
    load_dotenv()
    db_url = args.db_url or os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set (see .env)")

    rows = parse(args.url, polite_get(args.url).text)
    stats = {"inserted": 0, "updated": 0}
    with psycopg.connect(db_url) as conn:
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
                           ON CONFLICT (source, source_result_id) DO UPDATE SET
                             total_points = EXCLUDED.total_points, points = EXCLUDED.points
                           RETURNING (xmax = 0) AS was_inserted""",
                        (r["series_key"], r["series_name"], r["event_name"], r["season"],
                         r["rider_name"], r["horse_name"],
                         normalize_name(r["rider_name"]), normalize_name(r["horse_name"]),
                         r["total_points"], Json(r["points"]), rid),
                    )
                    stats["inserted" if cur.fetchone()[0] else "updated"] += 1
    print(f"rows={len(rows)} stored={stats['inserted'] + stats['updated']}")


if __name__ == "__main__":
    main()
