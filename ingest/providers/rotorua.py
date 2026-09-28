"""Provider adapter: Rotorua / NZ timing-export CSV -> canonical import records.

Handles this provider's dialect:
  - human dates ("Saturday 26 September 2026") -> ISO
  - two result-block layouts (4-col jump-off vs two-phase spill)
  - Rank EL/RET/NS -> status; mass rank-1 classes -> unplaced (null)
  - horse suffix " (H)"/" (P)" stripped before identity
  - height upper-bound extracted from class name
  - junk pedigree tokens (Unknown/N-A/-/Unsure/empty) -> omitted
  - class_type + series_key derived from class-name keywords
  - arena columns passed through (Location/arena/type/surface/start)

Usage:
  ingest/.venv/bin/python ingest/providers/rotorua.py \
    "/Users/pusdatin06/Downloads/Rotorua Show Jumping - Results (1).csv" \
    --out /tmp/rotorua-records.json [--event-json]
"""
import argparse
import csv
import json
import re
import sys
from collections import Counter
from datetime import datetime

JUNK = {"", "unknown", "n/a", "na", "n-a", "-", "--", "unsure", "nil", "n/a.", "tbd"}


def clean(v):
    t = (v or "").strip()
    return None if t.lower() in JUNK else t


def num(v):
    t = (v or "").strip()
    if not t:
        return None
    try:
        return float(t) if "." in t else int(t)
    except ValueError:
        return None


def parse_date(v):
    return datetime.strptime(v.strip(), "%A %d %B %Y").date().isoformat()


def parse_height(class_name):
    m = re.findall(r"(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*(cm|m)\b", class_name, re.I)
    if not m:
        return None
    vals = []
    for lo, hi, unit in m:
        f = 100.0 if unit.lower() == "m" else 1.0
        vals.append(float(hi or lo) * f)
    return int(round(max(vals)))


def classify(name):
    n = name.lower()
    ctype, series = "Standard", None
    if "grand prix" in n:
        ctype = "Grand Prix"
        series = "pony-grand-prix-series" if "pony" in n else "grand-prix-series"
    elif "mini prix" in n:
        ctype = "Premier"
    elif "young horse" in n:
        ctype = "Young Horse"
        series = "young-horse-series"
    elif "young rider" in n:
        ctype, series = "Open", "young-rider-series"
    elif "junior rider" in n:
        ctype, series = "Open", "junior-rider-series"
    elif "amateur rider" in n:
        ctype, series = "Amateur", "amateur-rider-series"
    elif n.startswith("open pony") or " open pony " in n:
        ctype = "Open"
    elif n.startswith("open horse") or " open horse " in n:
        ctype = "Open"
    elif n.startswith("intro"):
        ctype = "Standard"
    return ctype, series


def strip_suffix(name):
    return re.sub(r"\s*\([HP]\)\s*$", "", (name or "").strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--out", default="")
    ap.add_argument("--event-json", action="store_true")
    args = ap.parse_args()

    with open(args.csv_path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print(f"[rotorua] {len(rows)} data rows", file=sys.stderr)

    recs = []
    for i, r in enumerate(rows, start=2):
        rank_raw = (r.get("Rank") or "").strip()
        r1_raw = (r.get("First Round Penalties Total") or "").strip()
        status, placing = "finished", None
        flag = rank_raw.upper() if rank_raw.upper() in ("EL", "RET", "NS") else (
            r1_raw.upper() if r1_raw.upper() in ("EL", "RET", "NS") else "")
        if flag:
            status = {"EL": "eliminated", "RET": "retired", "NS": "withdrawn"}[flag]
        elif rank_raw:
            try:
                placing = int(rank_raw)
            except ValueError:
                pass
        cls = r.get("Class") or ""
        r1t = num(r.get("First Round Penalties Total"))
        second = {
            "t": num(r.get("Jump Off Penalties Total")),
            "j": num(r.get("Jump Off Penalties Jump")),
            "ti": num(r.get("Jump Off Penalties Time")),
            "time": num(r.get("Jump Off Time")),
        }
        use_jo = "261.5" in cls  # FEI GP article => real jump-off; else two-phase second round
        rec = {
            "class_name": cls,
            "class_date": parse_date(r.get("Date") or ""),
            "rider_name": (r.get("Rider Name") or "").strip(),
            "horse_name": strip_suffix(r.get("Horse Name")),
            "placing": placing,
            "faults": num(r.get("First Round Penalties Jump")),
            "time_faults": num(r.get("First Round Penalties Time")),
            "time": num(r.get("First Round Time")),
            "status": status if status != "finished" else None,
            "gender": clean(r.get("Sex")),
            "color": clean(r.get("Colour")),
            "year_of_birth": num(r.get("Born")),
            "sire": clean(r.get("Sire")),
            "damsire": clean(r.get("Dam Sire")),
            "breeder": clean(r.get("Breeder")),
            "prize": num(r.get("Prize")),
            "arena_name": clean(r.get("Location")),
            "class_arena_type": clean(r.get("Indoor / Outdoor")),
            "surface": clean(r.get("Surface")),
            "start_time": (r.get("Time Started") or "").strip() or None,
            "height_cm": parse_height(cls),
        }
        ctype, series = classify(cls)
        rec["class_type"] = ctype
        if series:
            rec["series_key"] = series
        if use_jo:
            rec["jumpoff_faults"] = second["t"]
            rec["jumpoff_time"] = second["time"] if second["time"] is not None else second["ti"]
        else:
            rec["round2_faults"] = second["t"]
            rec["round2_time"] = second["time"] if second["time"] is not None else second["ti"]
        # drop Nones for a clean canonical record
        recs.append({k: v for k, v in rec.items() if v is not None})

    # mass rank-1 classes (unplaced schooling-style) -> placing null
    by_class = {}
    for idx, rec in enumerate(recs):
        by_class.setdefault(rec["class_name"], []).append(idx)
    nulled = 0
    for cls, idxs in by_class.items():
        ones = [i for i in idxs if recs[i].get("placing") == 1]
        if len(ones) > 5:
            for i in ones:
                recs[i]["placing"] = None
                nulled += 1
    print(f"[rotorua] {len(by_class)} classes, {len(recs)} records, nulled {nulled} mass-1st placings",
          file=sys.stderr)
    for cls in sorted(by_class)[:30]:
        print(f"  class: {cls[:80]}", file=sys.stderr)

    out = {"records": recs}
    if args.event_json:
        out["event"] = {"name": "Rotorua Show Jumping", "date_start": "2026-09-26",
                        "date_end": "2026-09-27", "venue": "Rotorua", "region": "Bay of Plenty"}
    text = json.dumps(out, indent=1)
    if args.out:
        open(args.out, "w").write(text)
        print(f"[rotorua] wrote {args.out}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
