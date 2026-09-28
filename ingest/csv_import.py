"""CSV importer — EQIndex Step 2.

Pipeline per row (PRD §10):
  CSV row -> raw_results (staging, status=pending)
          -> upsert event / class / horse / rider (identity by normalized_name)
          -> round_results (dedup) -> raw_results.status = cleaned/failed

Identity & idempotency:
  - horse/rider matched on normalized_name (ingest/normalize.py).
  - re-running the same file inserts nothing (UNIQUE source+source_result_id
    on raw_results, UNIQUE class+horse+rider on round_results).

Usage:
  ingest/.venv/bin/python ingest/csv_import.py --csv ingest/samples/pulomas_csi_sample.csv
  ingest/.venv/bin/python ingest/csv_import.py --csv path/to/file.csv --source CSV

Expected header (1 row = 1 round):
  event_name,date_start,date_end,venue,venue_country,region,arena_type,season,
  class_name,class_date,height_cm,level,format,rider,horse,
  breed,age,gender,sire,dam,breeder,country,
  rider_region,rider_series,rider_nationality,
  jump_faults,time_faults,time_seconds,finish_place,source_result_id
  - season: optional, auto-derived (Aug-Jul season) when empty.
  - format: optional jumping format (Two-phase, Jump-off, Speed, Power & Speed).
  - breed/age/gender/sire/dam/breeder/country, rider_region/rider_series/
    rider_nationality: optional enrichment — filled on create, fill-if-null
    after that (never overwrites curated values).
  - source_result_id: optional, auto-generated when empty.
  - empty faults = 0; empty time_seconds/finish_place = NULL.
"""
import argparse
import csv
import os
import sys
from datetime import date

import psycopg
from psycopg.types.json import Json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from normalize import normalize_name, slug

SOURCES = ("FEI", "EQUIPE", "ESNZ", "CSV", "MANUAL")
FORMATS = ("Two-phase", "Jump-off", "Speed", "Power & Speed")


def clean_format(value):
    v = (value or "").strip()
    return v if v in FORMATS else None


def load_dotenv(path=".env"):
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def derive_season(start: date) -> str:
    # NZ-style Aug-Jul season: Aug 2025 -> '2025-2026', Jun 2025 -> '2024-2025'
    if start.month >= 8:
        return f"{start.year}-{start.year + 1}"
    return f"{start.year - 1}-{start.year}"


def num(value, default=None):
    value = (value or "").strip()
    if not value:
        return default
    try:
        return float(value) if "." in value else int(value)
    except ValueError:
        return default


def int_or_none(value):
    v = num(value)
    return None if v is None else int(v)


GENDERS = ('Mare', 'Gelding', 'Stallion', 'Filly', 'Colt', 'Mare/Other', 'Unknown')
RIDER_CATS = ('Junior', 'Young Rider', 'Under 25', 'Amateur', 'Pony', 'Open')


def clean_str(value):
    v = (value or '').strip()
    return v or None


def clean_member(value, vocab):
    v = (value or '').strip().lower()
    if not v:
        return None
    return next((x for x in vocab if x.lower() == v), None)


def clean_age(value):
    v = (value or '').strip()
    if not v:
        return None
    try:
        n = int(v)
    except ValueError:
        return None
    return n if 0 <= n <= 40 else None


def fill_null(cur, table, ident, obj):
    """UPDATE fill-if-null only; returns 1 when at least one column was NULL."""
    sets = [(k, v) for k, v in obj.items() if v is not None]
    if not sets:
        return 0
    set_sql = ', '.join(f'{k} = COALESCE({k}, %s)' for k, _ in sets)
    guard = ' OR '.join(f'{k} IS NULL' for k, _ in sets)
    cur.execute(f'UPDATE {table} SET {set_sql} WHERE id = %s AND ({guard})',
                [*[v for _, v in sets], ident])
    return cur.rowcount


def horse_enrich(r):
    return {
        'breed': clean_str(r.get('breed')), 'age': clean_age(r.get('age')),
        'gender': clean_member(r.get('gender'), GENDERS),
        'sire': clean_str(r.get('sire')), 'dam': clean_str(r.get('dam')),
        'breeder': clean_str(r.get('breeder')), 'country': clean_str(r.get('country')),
    }


def rider_enrich(r):
    # NB: plain `region` keeps its legacy meaning (event region + new-rider
    # default); explicit rider fields use the rider_* prefix.
    return {
        'region': clean_str(r.get('rider_region')),
        'series_category': clean_member(r.get('series_category') or r.get('rider_series'), RIDER_CATS),
        'nationality': clean_str(r.get('rider_nationality')),
    }


def get_or_create_horse(cur, name, extra=None):
    norm = normalize_name(name)
    cur.execute("SELECT id FROM horses WHERE normalized_name = %s", (norm,))
    row = cur.fetchone()
    if row:
        if extra:
            fill_null(cur, 'horses', row[0], extra)
        return row[0]
    cols = ['name', 'normalized_name']
    vals = [name.strip(), norm]
    for k, v in (extra or {}).items():
        if v is not None:
            cols.append(k)
            vals.append(v)
    cur.execute(
        f"INSERT INTO horses ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(vals))}) RETURNING id",
        vals,
    )
    return cur.fetchone()[0]


def get_or_create_rider(cur, name, region, extra=None):
    norm = normalize_name(name)
    base_region = (region or '').strip() or None
    cur.execute("SELECT id FROM riders WHERE normalized_name = %s", (norm,))
    row = cur.fetchone()
    if row:
        if extra:
            fill_null(cur, 'riders', row[0], extra)
        return row[0]
    vals = {**(extra or {})}
    if vals.get('region') is None:
        vals['region'] = base_region
    cols = ['name', 'normalized_name'] + [k for k, v in vals.items() if v is not None]
    params = [name.strip(), norm] + [v for k, v in vals.items() if v is not None]
    cur.execute(
        f"INSERT INTO riders ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(params))}) RETURNING id",
        params,
    )
    return cur.fetchone()[0]


def get_or_create_event(cur, r, source):
    show_id = slug(f"{r['event_name']}-{r['date_start']}")
    cur.execute(
        """INSERT INTO events
             (name, date_start, date_end, venue, venue_country, region,
              arena_type, season, source, external_show_id, external_event_id)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (source, external_show_id, external_event_id) DO NOTHING""",
        (r["event_name"].strip(), r["date_start"], r["date_end"], r["venue"].strip(),
         (r.get("venue_country") or "").strip() or None, (r.get("region") or "").strip() or None,
         (r.get("arena_type") or "").strip() or None,
         (r.get("season") or "").strip() or derive_season(date.fromisoformat(r["date_start"])),
         source, show_id, show_id),
    )
    cur.execute(
        "SELECT id FROM events WHERE source=%s AND external_show_id=%s AND external_event_id=%s",
        (source, show_id, show_id),
    )
    event_id = cur.fetchone()[0]
    # enrich-on-first-sight: fill event blanks from row columns (never overwrite)
    fill_null(cur, 'events', event_id, {
        'venue': (r.get("venue") or "").strip() or None,
        'venue_country': (r.get("venue_country") or "").strip() or None,
        'region': (r.get("region") or "").strip() or None,
        'arena_type': (r.get("arena_type") or "").strip() or None,
    })
    return event_id, show_id


def get_or_create_class(cur, event_id, r, source, show_id):
    class_id_ext = slug(f"{r['class_name']}-{r.get('class_date') or r['date_start']}")
    cur.execute(
        """INSERT INTO classes (event_id, name, class_date, height_cm, level, format, source, external_class_id)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (event_id, external_class_id) DO NOTHING""",
        (event_id, r["class_name"].strip(), (r.get("class_date") or "").strip() or None,
         int_or_none(r.get("height_cm")), (r.get("level") or "").strip() or None,
         clean_format(r.get("format")),
         source, class_id_ext),
    )
    cur.execute(
        "SELECT id FROM classes WHERE event_id=%s AND external_class_id=%s",
        (event_id, class_id_ext),
    )
    return cur.fetchone()[0], class_id_ext


def import_row(cur, r, source, show_default_region=""):
    show_id = slug(f"{r['event_name']}-{r['date_start']}")
    norm_horse = normalize_name(r["horse"])
    norm_rider = normalize_name(r["rider"])
    src_result_id = (r.get("source_result_id") or "").strip() or None
    # class ext id needed for auto result id -> resolve class first via dry lookup
    # (event/class upserts are idempotent, so order is safe)
    event_id, show_id = get_or_create_event(cur, r, source)
    class_id, class_ext = get_or_create_class(cur, event_id, r, source, show_id)
    if not src_result_id:
        src_result_id = f"{class_ext}:{norm_horse}:{norm_rider}"

    cur.execute(
        """INSERT INTO raw_results (source, external_show_id, external_class_id, source_result_id, payload)
           VALUES (%s,%s,%s,%s,%s)
           ON CONFLICT (source, external_class_id, source_result_id) DO NOTHING
           RETURNING id""",
        (source, show_id, class_ext, src_result_id, Json(r)),
    )
    raw = cur.fetchone()
    if raw is None:
        return "skipped"  # already imported
    raw_id = raw[0]

    try:
        if not norm_horse or not norm_rider:
            raise ValueError("horse/rider name empty")
        horse_id = get_or_create_horse(cur, r["horse"], horse_enrich(r))
        rider_id = get_or_create_rider(cur, r["rider"], r.get("region") or show_default_region, rider_enrich(r))
        jump = num(r.get("jump_faults"), 0)
        time_f = num(r.get("time_faults"), 0)
        total = float(jump) + float(time_f)
        cur.execute(
            """INSERT INTO round_results
                 (event_id, class_id, horse_id, rider_id, jump_faults, time_faults,
                  total_faults, time_seconds, finish_place, clear_round,
                  height_cm, source, source_result_id, raw_result_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT DO NOTHING""",
            (event_id, class_id, horse_id, rider_id, jump, time_f, total,
             num(r.get("time_seconds")), int_or_none(r.get("finish_place")),
             total == 0, int_or_none(r.get("height_cm")),
             source, src_result_id, raw_id),
        )
        cur.execute("UPDATE raw_results SET status='cleaned' WHERE id=%s", (raw_id,))
        return "inserted"
    except Exception as exc:  # noqa: BLE001 - recorded into raw_results.error
        cur.execute("UPDATE raw_results SET status='failed', error=%s WHERE id=%s",
                    (str(exc), raw_id))
        return "failed"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--source", default="CSV", choices=SOURCES)
    ap.add_argument("--db-url", default=None)
    args = ap.parse_args()
    load_dotenv()
    db_url = args.db_url or os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set (see .env)")

    stats = {"inserted": 0, "skipped": 0, "failed": 0, "classes": set()}
    with psycopg.connect(db_url) as conn:
        with open(args.csv, newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                with conn.transaction():
                    with conn.cursor() as cur:
                        outcome = import_row(cur, r, args.source)
                stats[outcome] += 1
        # refresh field_size for touched classes
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE classes c SET field_size = t.n, updated_at = NOW()
                       FROM (SELECT class_id, COUNT(*) n FROM round_results GROUP BY 1) t
                       WHERE c.id = t.class_id"""
                )

    print(f"rows={stats['inserted'] + stats['skipped'] + stats['failed']} "
          f"inserted={stats['inserted']} skipped_dup={stats['skipped']} failed={stats['failed']}")


if __name__ == "__main__":
    main()
