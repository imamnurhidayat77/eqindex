"""Seed search & compare gaps (additive, idempotent):
  1. Retag 4x 2026-2027 classes as format='Two-phase'.
  2. Fill missing horse ages (peer-by-age needs them).
  3. New 'Taranaki Champs' 2026-2027 edition (YoY demo: same event ran 2025-2026).
     Uses NEW weak horses/riders so existing stats are untouched.

Usage:
  ingest/.venv/bin/python ingest/seed_search_compare.py
"""
import os
import random
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from csv_import import import_row, load_dotenv  # noqa: E402
from normalize import normalize_name  # noqa: E402

rng = random.Random(77)

RETAG = [
    ("Elite Masters", "Elite 130cm"),
    ("National Championship", "Elite 130cm"),
    ("Season Final", "National 130cm"),
    ("Taranaki Summer Champs", "Elite 140cm"),
]

AGES = {
    "Albatross": 11, "Aoraki Star": 8, "Fern Hollow": 10, "Huia Feather": 7,
    "Kakapo Green": 9, "Kauri King": 12, "Kea Peak": 8, "Kowhai Gold": 9,
    "Manuka Honey": 10, "Moa Ridge": 7, "Nikau Palm": 11, "Pohutukawa": 9,
    "Pukeko Bay": 8, "Rimu Grove": 10, "Takahe Blue": 9, "Tui Song": 7,
    "Weka Trail": 8, "Willow Park": 11,
    "Egmont Mist": 9, "Sugarloaf": 8, "Paritutu": 10, "Fanthams Peak": 7,
}

YOY_EVENT = ("Taranaki Champs", "2027-01-07", "2027-01-09",
             "Taranaki Showgrounds", "Taranaki", "Grass Arena")
YOY_CLASSES = [("National 120cm", "2027-01-07", 120, "National"),
               ("Elite 130cm", "2027-01-08", 130, "Elite")]
YOY_HORSES = ["Egmont Mist", "Sugarloaf", "Paritutu", "Fanthams Peak"]
YOY_RIDERS = ["Casey Bell", "Jordan Reid"]


def main():
    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set (see .env)")
    with psycopg.connect(db_url) as conn:
        # 1. retag Two-phase
        with conn.transaction():
            with conn.cursor() as cur:
                have = cur.execute("SELECT COUNT(*) FROM classes WHERE format = 'Two-phase'").fetchone()[0]
                if have < len(RETAG):
                    for ev, cn in RETAG:
                        cur.execute(
                            """UPDATE classes SET format = 'Two-phase'
                               WHERE id IN (SELECT c.id FROM classes c JOIN events e ON e.id = c.event_id
                                            WHERE e.name = %s AND c.name = %s AND c.format IS NULL)""",
                            (ev, cn),
                        )
                    now = cur.execute("SELECT COUNT(*) FROM classes WHERE format = 'Two-phase'").fetchone()[0]
                    print(f"retag two-phase done (now {now})")
                else:
                    print("skip retag: two-phase classes present")

        # 2. ages
        with conn.transaction():
            with conn.cursor() as cur:
                n = 0
                for hname, age in AGES.items():
                    cur.execute("UPDATE horses SET age = %s WHERE normalized_name = %s AND age IS NULL",
                                (age, normalize_name(hname)))
                    n += cur.rowcount
                # fallback for any name mismatch: match case-insensitively
                cur.execute("SELECT COUNT(*) FROM horses WHERE age IS NULL")
                left = cur.fetchone()[0]
                print(f"ages set={n} still-null={left}")

        # 3. YoY event edition
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM events WHERE name = 'Taranaki Champs' AND season = '2026-2027'")
            exists = cur.fetchone()
        if exists:
            print("skip yoy: Taranaki Champs 2026-2027 present")
            return
        name, ds, de, venue, region, arena = YOY_EVENT
        stats = {"inserted": 0, "skipped": 0, "failed": 0}
        for cname, cdate, height, level in YOY_CLASSES:
            starters = YOY_HORSES[:]  # 4 new horses
            # pad field to 8 with existing filler horses (faulted rounds only lower their EQ)
            starters += ["Willow Park", "Pohutukawa", "Kea Peak", "Moa Ridge"]
            assert len(starters) == 8
            rows = []
            for i, horse in enumerate(starters):
                rider = YOY_RIDERS[i % 2]
                is_new = horse in YOY_HORSES
                # winners: first new horse per class goes clear & fastest
                win = is_new and horse == YOY_HORSES[0 if cname.startswith("National") else 1]
                if win:
                    jump, tf, t = 0, 0, round(66 + rng.random() * 2, 2)
                elif is_new:
                    jump, tf, t = rng.choice([4, 8]), 0, round(70 + rng.random() * 15, 2)
                else:
                    jump, tf, t = rng.choice([8, 12]), rng.choice([0, 1]), round(72 + rng.random() * 15, 2)
                rows.append({
                    "event_name": name, "date_start": ds, "date_end": de,
                    "venue": venue, "venue_country": "NZL", "region": region,
                    "arena_type": arena, "season": "2026-2027",
                    "class_name": cname, "class_date": cdate,
                    "height_cm": str(height), "level": level,
                    "rider": rider, "horse": horse,
                    "jump_faults": str(jump), "time_faults": str(tf),
                    "time_seconds": f"{t:.2f}", "finish_place": "",
                    "source_result_id": f"yoy2627-{cdate}-{horse}-{rider}".lower().replace(" ", "-"),
                })
            rows.sort(key=lambda r: (int(r["jump_faults"]) + int(r["time_faults"]), float(r["time_seconds"])))
            for i, r in enumerate(rows, 1):
                r["finish_place"] = str(i)
                with conn.transaction():
                    with conn.cursor() as cur:
                        stats[import_row(cur, r, "CSV")] += 1
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE classes c SET field_size = t.n, updated_at = NOW()
                       FROM (SELECT class_id, COUNT(*) n FROM round_results GROUP BY 1) t
                       WHERE c.id = t.class_id
                       AND c.event_id IN (SELECT id FROM events WHERE name = 'Taranaki Champs' AND season = '2026-2027')""")
        print(f"yoy rounds inserted={stats['inserted']} skipped={stats['skipped']} failed={stats['failed']}")


if __name__ == "__main__":
    main()
