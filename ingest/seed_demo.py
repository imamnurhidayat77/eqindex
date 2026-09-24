"""Demo dataset generator — NZ-flavoured, fully synthetic, deterministic.

Wipes demo tables (keeps users + schema_migrations) then generates:
  8 shows, 20 horses, 12 riders, ~200 rounds, training + health records,
  2 synthetic series standings. All names/places fictional.

Reuses the production CSV importer row-by-row so dummy data flows through
the exact same cleaning/dedup path as real EO files.

Usage:
  ingest/.venv/bin/python ingest/seed_demo.py
"""
import os
import random
import sys
from datetime import date, timedelta

import psycopg
from psycopg.types.json import Json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from csv_import import import_row, load_dotenv  # noqa: E402
from normalize import normalize_name, slug  # noqa: E402
from scrapers.base import store_raw  # noqa: E402

rng = random.Random(42)

RIDERS = [
    ("Sophie Bennett", "Hawke's Bay"), ("Daniel McLeod", "Waikato"),
    ("Ava Thompson", "Canterbury"), ("Liam Carter", "Auckland"),
    ("Mia Walker", "Otago"), ("Jack Sullivan", "Manawatu"),
    ("Olivia Parker", "Bay of Plenty"), ("Noah Williams", "Wellington"),
    ("Isla Robertson", "Southland"), ("Lucas Anderson", "Taranaki"),
    ("Ruby Campbell", "Northland"), ("Henry Mitchell", "Gisborne"),
]
HORSES = [
    "Kiwi Spirit", "Southern Cross", "Willow Park", "Pohutukawa", "Rimu Grove",
    "Kowhai Gold", "Tui Song", "Fern Hollow", "Aoraki Star", "Kauri King",
    "Manuka Honey", "Pukeko Bay", "Weka Trail", "Nikau Palm", "Kea Peak",
    "Moa Ridge", "Huia Feather", "Kakapo Green", "Takahe Blue", "Albatross",
]
SHOWS = [
    ("Hawke's Bay A&P Show", "2025-10-22", "2025-10-24", "Hawke's Bay Showgrounds", "Hawke's Bay", "Outdoor Turf"),
    ("Waikato Premier Show", "2025-10-30", "2025-11-01", "Mystery Creek", "Waikato", "Outdoor Turf"),
    ("Canterbury Xmas Cracker", "2025-12-04", "2025-12-06", "Canterbury Agricultural Park", "Canterbury", "Grass Arena"),
    ("Taupo Xmas Classic", "2025-12-17", "2025-12-19", "National Equestrian Centre", "Waikato", "Sand Arena"),
    ("Waitemata WC Qualifier", "2026-01-15", "2026-01-17", "Woodhill Sands", "Auckland", "Sand Arena"),
    ("NZ Nationals", "2026-01-21", "2026-01-24", "McLeans Island", "Canterbury", "Indoor Arena"),
    ("Taranaki Champs", "2026-01-29", "2026-01-31", "Taranaki Showgrounds", "Taranaki", "Grass Arena"),
    ("Glistening Waters Final", "2026-02-12", "2026-02-14", "Glistening Waters", "Waikato", "Indoor Arena"),
]
CLASSES = [
    ("Rising Star 110cm", 110, "A2"), ("Young Rider 120cm", 120, "A2"),
    ("Premier League 130cm", 130, "AM5"), ("Grand Prix 140cm", 140, "FEI Art. 238.2.2"),
]
TRAINING_TYPES = ["Flatwork", "Jumping gridwork", "Course practice", "Pole work",
                  "Hacking", "Lunging", "Gymnastics"]
SHOW_NAMES_SHORT = ["HB A&P", "Waikato", "Canty Xmas", "Taupo Xmas", "Waitemata", "Nationals"]
SERIES = [
    ("demo-premier-2526", "Demo Premier League", "Demo National Series 2025-2026", "2025-2026"),
    ("demo-rising-2526", "Demo Rising Star Series", "Demo National Series 2025-2026", "2025-2026"),
]

WIPE = ["round_results", "raw_results", "classes", "events", "horse_aliases",
        "rider_aliases", "breeder_aliases", "horses", "riders", "training_records",
        "health_records", "series_standings", "watchlist_items", "saved_comparisons"]


def main():
    load_dotenv()
    # partnerships: each horse gets 1 rider, some get 2
    pairs = [(h, i % len(RIDERS)) for i, h in enumerate(HORSES)]
    for h in rng.sample(HORSES, 6):
        pairs.append((h, rng.randrange(len(RIDERS))))

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(f"TRUNCATE {', '.join(WIPE)} CASCADE")
        stats = {"inserted": 0, "skipped": 0, "failed": 0}
        for show in SHOWS:
            name, ds, de, venue, region, arena = show
            for ci in rng.sample(range(len(CLASSES)), rng.randint(2, 3)):
                cname, height, level = CLASSES[ci]
                starters = rng.sample(pairs, rng.randint(6, 10))
                results = []
                for horse, ri in starters:
                    rider, rregion = RIDERS[ri]
                    jump = rng.choices([0, 0, 0, 4, 4, 8, 12], k=1)[0]
                    tf = rng.choices([0, 0, 0, 0, 0, 1, 2], k=1)[0]
                    results.append({
                        "event_name": name, "date_start": ds, "date_end": de,
                        "venue": venue, "venue_country": "NZL", "region": region,
                        "arena_type": arena, "season": "",
                        "class_name": cname, "class_date": ds,
                        "height_cm": str(height), "level": level,
                        "rider": rider, "horse": horse,
                        "jump_faults": str(jump), "time_faults": str(tf),
                        "time_seconds": f"{rng.uniform(65, 90):.2f}",
                        "finish_place": "", "source_result_id": "",
                    })
                # proper ranking: faults asc, time asc
                results.sort(key=lambda r: (int(r["jump_faults"]) + int(r["time_faults"]),
                                            float(r["time_seconds"])))
                for i, r in enumerate(results, 1):
                    r["finish_place"] = str(i)
                    with conn.transaction():
                        with conn.cursor() as cur:
                            stats[import_row(cur, r, "CSV")] += 1
        # training + health records
        with conn.transaction():
            with conn.cursor() as cur:
                horses = cur.execute("SELECT id, name FROM horses").fetchall()
                riders = {r[1]: r[0] for r in cur.execute("SELECT id, name FROM riders")}
                hid_by_name = {h[1]: h[0] for h in horses}
                pair_rider = {h: RIDERS[ri][0] for h, ri in pairs}
                for _ in range(40):
                    hname = rng.choice(HORSES)
                    d = date(2025, 10, 1) + timedelta(days=rng.randint(0, 130))
                    cur.execute(
                        "INSERT INTO training_records (horse_id, rider_id, date, type, intensity, notes)"
                        " VALUES (%s,%s,%s,%s,%s,%s)",
                        (hid_by_name[hname], riders.get(pair_rider[hname]), d,
                         rng.choice(TRAINING_TYPES), rng.choice(["Low", "Medium", "High"]),
                         "Demo session"),
                    )
                for _ in range(14):
                    hname = rng.choice(HORSES)
                    d = date(2025, 10, 1) + timedelta(days=rng.randint(0, 130))
                    cur.execute(
                        "INSERT INTO health_records (horse_id, date, category, description, provider)"
                        " VALUES (%s,%s,%s,%s,%s)",
                        (hid_by_name[hname], d,
                         rng.choice(["VET", "TREATMENT", "FARRIER", "VACCINATION"]),
                         "Demo record", "Demo Vet Clinic"),
                    )
        # synthetic series standings (top pairs per series)
        with conn.transaction():
            with conn.cursor() as cur:
                for key, sname, ename, season in SERIES:
                    top = rng.sample(pairs, 10)
                    for rank_i, (hname, ri) in enumerate(top):
                        rname = RIDERS[ri][0]
                        total = rng.randint(40, 150) - rank_i * 5
                        pts = {s: rng.randint(0, 30) for s in rng.sample(SHOW_NAMES_SHORT, 4)}
                        rid = slug(f"{key}-{rname}-{hname}")
                        store_raw(cur, "CSV", f"demo-{key}", "standings", rid,
                                  {"kind": "standing_demo", "series_key": key})
                        cur.execute(
                            """INSERT INTO series_standings
                                 (series_key, series_name, event_name, season, rider_name, horse_name,
                                  normalized_rider, normalized_horse, total_points, points,
                                  source, source_result_id)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'CSV',%s)""",
                            (key, sname, ename, season, rname, hname,
                             normalize_name(rname), normalize_name(hname),
                             total, Json(pts), rid),
                        )
    print(f"rounds inserted={stats['inserted']} skipped={stats['skipped']} failed={stats['failed']}")


if __name__ == "__main__":
    main()
