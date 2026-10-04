"""Enrich horses from HorseReg bookmarklet CSVs (fill-if-empty only).

Usage:
  ingest/.venv/bin/python ingest/import_horsereg.py --dry-run file.csv [file2.csv ...]
  ingest/.venv/bin/python ingest/import_horsereg.py --commit file.csv [...]

Rules:
- Match our horses by normalized_name (exact only; prefix/ambiguous rows are
  reported and skipped — a human resolves them via Naming Review).
- Only fills NULL/empty year_of_birth, gender, breeder, sire, dam.
  Never overwrites existing values. Owner names are intentionally skipped
  (privacy: no owner_name column, and opt-out policy).
- Gender mapped to the horses_gender CHECK list; anything else is skipped.
- DOB year must satisfy the year_of_birth CHECK (1980-2100).
"""
import argparse
import csv
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from normalize import normalize_name  # noqa: E402

GENDER = {
    'MARE': 'Mare', 'GELDING': 'Gelding', 'STALLION': 'Stallion',
    'COLT': 'Colt', 'FILLY': 'Filly', 'M': 'Mare', 'G': 'Gelding',
    'S': 'Stallion', 'C': 'Colt', 'F': 'Filly',
}


def dob_year(raw):
    if not raw:
        return None
    part = raw.strip().split(' ')[0].replace('-', '/')
    bits = part.split('/')
    try:
        y = int(bits[0] if len(bits[0]) == 4 else bits[-1])
    except (ValueError, IndexError):
        return None
    return y if 1980 <= y <= 2100 else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='+')
    ap.add_argument('--commit', action='store_true')
    args = ap.parse_args()

    wanted = {}  # normalized -> row (first exact match wins)
    for path in args.files:
        with open(path, newline='') as f:
            for row in csv.DictReader(f):
                if (row.get('match') or '').strip().lower() != 'exact':
                    continue
                norm = normalize_name(row.get('our_name') or '')
                if norm and norm not in wanted:
                    wanted[norm] = row
    print(f'exact rows: {len(wanted)}')

    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        sys.exit('DATABASE_URL not set')
    stats = {'horses': 0, 'fields': 0, 'skipped_filled': 0, 'skipped_norow': 0}
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            horses = cur.execute(
                'SELECT id, normalized_name, year_of_birth, gender, breeder, sire, dam FROM horses').fetchall()
            by_norm = {h[1]: h for h in horses}
            for norm, row in wanted.items():
                h = by_norm.get(norm)
                if not h:
                    stats['skipped_norow'] += 1
                    continue
                hid, _, yob, gen, bre, sir, dam = h
                patch = {}
                y = dob_year(row.get('dob'))
                if y and not yob:
                    patch['year_of_birth'] = y
                g = GENDER.get((row.get('gender') or '').strip().upper())
                if g and not gen:
                    patch['gender'] = g
                for col, val in (('breeder', row.get('breeder')), ('sire', row.get('sire')), ('dam', row.get('dam'))):
                    if val and val.strip() and val.strip().lower() not in ('', 'unknown'):
                        cur_val = {'breeder': bre, 'sire': sir, 'dam': dam}[col]
                        if not cur_val:
                            patch[col] = val.strip()
                        else:
                            stats['skipped_filled'] += 1
                if not patch:
                    continue
                stats['horses'] += 1
                stats['fields'] += len(patch)
                print(f'  {row.get("our_name")}: {patch}')
                if args.commit:
                    sets = ', '.join(f'{k} = %s' for k in patch)
                    cur.execute(f'UPDATE horses SET {sets} WHERE id = %s', [*patch.values(), hid])
        if args.commit:
            conn.commit()
            print('COMMITTED')
        else:
            print('dry-run only — rerun with --commit to apply')
    print(stats)


if __name__ == '__main__':
    main()
