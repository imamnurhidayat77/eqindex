"""Enrich horses from HorseReg lookup CSV (browser-console export).

CSV columns: queried_name, id, ueln, name_with_additions, date_of_birth,
gender (G/M/S/U), color, sire, dame (=dam), sire_of_dam, breeder_name, ...

Usage:
  ingest/.venv/bin/python ingest/import_horsereg_lookup.py --dry-run ~/Downloads/horses_horsereg.csv
  ingest/.venv/bin/python ingest/import_horsereg_lookup.py --commit ~/Downloads/horses_horsereg.csv

Rules (same safety as import_horsereg.py):
- Match our horses by normalized_name (exact only).
- One queried_name may return many rows: prefer the row whose official
  name_with_additions exactly matches our horse; a lone single row is
  accepted; anything else is reported ambiguous and SKIPPED.
- Only fills NULL/empty year_of_birth, gender, breeder, sire, dam,
  damsire, color. Never overwrites. Owner names intentionally skipped.
- Gender: G->Gelding, M->Mare, S->Stallion; U/unknown skipped.
- 'Unknown'/empty values skipped.
"""
import argparse
import csv
import os
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from normalize import normalize_name  # noqa: E402

GENDER = {'G': 'Gelding', 'M': 'Mare', 'S': 'Stallion',
          'GELDING': 'Gelding', 'MARE': 'Mare', 'STALLION': 'Stallion',
          'COLT': 'Colt', 'FILLY': 'Filly'}


def clean(v):
    v = (v or '').strip()
    return v if v and v.lower() != 'unknown' else None


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

    # group rows by normalized queried_name
    groups = {}
    for path in args.files:
        with open(path, newline='') as f:
            for row in csv.DictReader(f):
                q = normalize_name(row.get('queried_name') or '')
                if q:
                    groups.setdefault(q, []).append(row)
    print(f'queried names: {len(groups)}')

    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        sys.exit('DATABASE_URL not set')
    db_url = db_url.strip().strip('"').strip("'")
    # psycopg rejects Supabase's ?pgbouncer flag — drop the query string
    db_url = db_url.split('?')[0]
    stats = {'horses': 0, 'fields': 0, 'skipped_ambiguous': 0,
             'skipped_norow': 0, 'skipped_filled': 0}
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            horses = cur.execute(
                'SELECT id, normalized_name, year_of_birth, gender, breeder, sire, dam, damsire, color FROM horses').fetchall()
            by_norm = {h[1]: h for h in horses}
            for qnorm, rows in sorted(groups.items()):
                h = by_norm.get(qnorm)
                if not h:
                    stats['skipped_norow'] += 1
                    continue
                hid, _, yob, gen, bre, sir, dam, dsir, col = h
                # pick row: official-name exact match wins; lone row accepted
                exact = [r for r in rows
                         if normalize_name(r.get('name_with_additions') or '') == qnorm]
                if len(exact) == 1:
                    row = exact[0]
                elif len(rows) == 1:
                    row = rows[0]
                else:
                    stats['skipped_ambiguous'] += 1
                    print(f'  AMBIGUOUS {qnorm}: {len(rows)} rows, {len(exact)} exact — skipped')
                    continue
                patch = {}
                y = dob_year(row.get('date_of_birth'))
                if y and not yob:
                    patch['year_of_birth'] = y
                g = GENDER.get((row.get('gender') or '').strip().upper())
                if g and not gen:
                    patch['gender'] = g
                for col, val in (('breeder', row.get('breeder_name')),
                                 ('sire', row.get('sire')),
                                 ('dam', row.get('dame')),
                                 ('damsire', row.get('sire_of_dam')),
                                 ('color', row.get('color'))):
                    v = clean(val)
                    if not v:
                        continue
                    cur_val = {'breeder': bre, 'sire': sir, 'dam': dam,
                               'damsire': dsir, 'color': col}[col]
                    if not cur_val:
                        patch[col] = v
                    else:
                        stats['skipped_filled'] += 1
                if not patch:
                    continue
                stats['horses'] += 1
                stats['fields'] += len(patch)
                print(f"  {qnorm}: {patch}")
                if args.commit:
                    sets = ', '.join(f'{k} = %s' for k in patch)
                    cur.execute(f'UPDATE horses SET {sets} WHERE id = %s',
                                [*patch.values(), hid])
        if args.commit:
            conn.commit()
            print('COMMITTED')
        else:
            print('dry-run only — rerun with --commit to apply')
    print(stats)


if __name__ == '__main__':
    main()
