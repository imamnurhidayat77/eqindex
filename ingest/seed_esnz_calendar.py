"""Preload ESNZ 2026-27 show calendar as events (no results).

Reads ingest/samples/esnz_2026_27_calendar.csv (official ESNZ Jumping &
Show Hunter dates) and inserts one event per show with dates, venue, tier
and SJ series flags. Pure Show Hunter rows (NS/EQ only, no tier, no SJ
series) are skipped — EQIndex covers show jumping only (Charles).

Idempotent: skips shows already present (same name + date_start).
New shows are created ACTIVE (is_active=TRUE); toggle off in Admin → Events.

Usage:
  ingest/.venv/bin/python ingest/seed_esnz_calendar.py
"""
import csv
import os
import sys
from datetime import date

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from csv_import import load_dotenv  # noqa: E402
from normalize import slug  # noqa: E402

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'samples', 'esnz_2026_27_calendar.csv')

MONTHS = {m: i + 1 for i, m in enumerate(
    ['january', 'february', 'march', 'april', 'may', 'june',
     'july', 'august', 'september', 'october', 'november', 'december'])}

SJ_FLAGS = ['WC', 'PL', 'HGP', 'PGP', 'YR', 'T', 'J', 'AR', 'PA', '7YO', '6YO', '5YO']
TIERS = ('Grand Prix', 'Premier', 'No Series')


def split_row(cells):
    """Shift-proof parse of the flag block.

    Pasted rows vary in length (trailing empties trimmed, occasional
    dropped columns), so positional alignment is unreliable. Instead:
    Tier is always the first cell after Venue when present; SJ flags and
    NS/EQ are single codes matched BY VALUE (a shifted 'NS' can never
    masquerade as '5YO'). Returns dict or None (fail).
    """
    if len(cells) < 4:
        return None
    out = {'month': cells[0].strip(), 'dates': cells[1].strip(),
           'event': cells[2].strip(), 'venue': cells[3].strip()}
    block = [c.strip() for c in cells[4:]]
    tier = block[0] if block and block[0] in TIERS else None
    flags = [c for c in SJ_FLAGS if c in block]
    has_sh = 'NS' in block or 'EQ' in block
    out.update({'tier': tier, 'flags': flags, 'has_sh': has_sh})
    return out


def parse_range(month_label, dates):
    """'August 2026' + '30-1' -> (date(2026,10,30)... ) — caller passes real month."""
    parts = (dates or '').strip().split('-')
    try:
        d1 = int(parts[0])
        d2 = int(parts[1]) if len(parts) > 1 else d1
    except ValueError:
        return None, None
    mon_name, year = month_label.rsplit(' ', 1)
    y, m = int(year), MONTHS[mon_name.strip().lower()]
    start = date(y, m, d1)
    if d2 < d1:  # crosses into next month (Dec -> Jan rolls the year)
        m2 = m + 1 if m < 12 else 1
        y2 = y if m < 12 else y + 1
        end = date(y2, m2, d2)
    else:
        end = date(y, m, d2)
    return start, end


def derive_season(start):
    if start.month >= 8:
        return f"{start.year}-{start.year + 1}"
    return f"{start.year - 1}-{start.year}"


def main():
    load_dotenv()
    with open(CSV_PATH, newline='', encoding='utf-8-sig') as f:
        rows = [r for r in csv.reader(f)]
    header, data = rows[0], rows[1:]
    print(f"rows={len(data)}")
    assert header[:4] == ['Month', 'Dates', 'Event', 'Venue'], header[:4]

    inserted, skipped, skipped_sh, failed = 0, 0, 0, 0
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        for cells in data:
            r = split_row(cells)
            if r is None or not r['month']:
                failed += 1
                continue
            name = r['event']
            if not name:
                skipped += 1
                continue
            tier = r['tier']
            flags = r['flags']
            if not tier and not flags:
                skipped_sh += 1  # pure Show Hunter (or no info at all) — out of scope
                continue
            try:
                start, end = parse_range(r['month'], r['dates'])
            except (ValueError, KeyError):
                failed += 1
                continue
            if not start:
                failed += 1
                continue
            venue = r['venue'] or 'TBC'
            season = derive_season(start)
            show_id = slug(f"{name}-{start.isoformat()}")
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id FROM events WHERE source = 'ESNZ' AND external_show_id = %s",
                        (show_id,))
                    if cur.fetchone():
                        skipped += 1
                        continue
                    cur.execute(
                        """INSERT INTO events
                             (name, date_start, date_end, venue, season, tier,
                              series_flags, is_active, source,
                              external_show_id, external_event_id)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,TRUE,'ESNZ',%s,%s)""",
                        (name, start, end, venue, season, tier, flags,
                         show_id, show_id),
                    )
                    inserted += 1
    print(f"inserted={inserted} skipped_dup_or_empty={skipped} skipped_show_hunter={skipped_sh} failed={failed}")


if __name__ == '__main__':
    main()
