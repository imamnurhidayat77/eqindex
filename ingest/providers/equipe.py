"""Provider adapter: Equipe online meeting API -> canonical import records.

Equipe pages are JS-rendered, but the underlying JSON API is public
(no auth). For a meeting like https://online.equipe.com/shows/82131:

  ingest/.venv/bin/python ingest/providers/equipe.py 82131 \
    --out /tmp/rotorua-records.json [--event-json] \
    [--series-map '{"27":"pro-am-series"}'] \
    [--event-name "Rotorua Spring Show"] [--venue "Fiber Fresh NEC Taupo"]

Flow: /api/v1/meetings/{id}/schedule lists classes (with class_no,
fence_height in metres, date) -> /api/v1/class_sections/{sid} holds
the starts (rider_name, horse_name, rank, per-phase time/faults).

Conventions mirror providers/rotorua.py:
  - heights: fence_height upper bound of ranges ("1.20/1.25" -> 125cm).
  - class_type + series_key guessed from class-name keywords
    (Grand Prix/Premier/Mini Prix/Young Horse/Pro Am/Young-Junior-
    Amateur Rider); --series-map {class_no: series_key} wins.
  - phase 1 -> faults/time/time_faults; phase 2 -> jumpoff_* when the
    name says IJO/AM5, else round2_*.
  - result codes: E -> eliminated, R -> retired, WD/NS -> withdrawn;
    unridden (DNS) rows are reported and skipped.
  - practice classes are imported with a "practice" note (admin can
    switch the class off); pass --skip-practice to drop them.

Output: JSON list of canonical records accepted by the admin import
{records} endpoint (class_name, class_date, rider_name, horse_name,
placing, faults, time, time_faults, height_cm, status, ...).
"""

import argparse
import json
import re
import sys
import urllib.request

BASE = "https://online.equipe.com"
UA = {"User-Agent": "Mozilla/5.0 (EQIndex ingest)"}


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def parse_height(raw):
    if raw is None:
        return None
    vals = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", str(raw))]
    return int(max(vals) * 100) if vals else None


def classify(name):
    n = (name or "").lower()
    ctype, series = "Standard", None
    if "grand prix" in n:
        ctype = "Grand Prix"
        series = "pony-grand-prix-series" if "pony" in n else "grand-prix-series"
    elif "mini prix" in n:
        ctype = "Premier"
    elif "young horse" in n or " year old " in n:
        ctype = "Young Horse"
        series = "young-horse-series"
    elif "young rider" in n:
        ctype, series = "Open", "young-rider-series"
    elif "junior rider" in n:
        ctype, series = "Open", "junior-rider-series"
    elif "amateur rider" in n or "amateur" in n:
        ctype, series = "Amateur", "amateur-rider-series"
    elif "pro am" in n or "pro-am" in n or "proam" in n:
        ctype, series = "Open", "pro-am-series"
    elif n.startswith("open pony") or " open pony " in n:
        ctype = "Open"
    elif n.startswith("open horse") or " open horse " in n:
        ctype = "Open"
    elif n.startswith("intro"):
        ctype = "Standard"
    return ctype, series


def phase_results(start):
    """Split per-phase result dicts keyed by phase number (1.0, 2.0).

    NB: the *round definitions* on the schedule use `position` (0, 1)
    but individual *results* use `phase` (1.0, 2.0) — do not mix up.
    """
    ph = {}
    for r in (start.get("results") or []):
        if not isinstance(r, dict):
            continue
        try:
            ph[float(r.get("phase"))] = r
        except (TypeError, ValueError):
            continue
    return ph.get(1.0, {}), ph.get(2.0, {})


def clean_num(v):
    """Numeric value or None; Equipe uses 999 as eliminated marker."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f >= 999 else f


def status_of(start, p1):
    res_status = (p1.get("status") or "").strip().lower()
    if res_status == "eliminated":
        return "E"
    if res_status == "retired":
        return "R"
    if res_status == "withdrawn":
        return "W"
    prev = (start.get("result_preview") or "").strip().upper()
    if prev in ("E", "EL", "ELIM", "ELIMINATED"):
        return "E"
    if prev in ("R", "RET", "RETIRED"):
        return "R"
    if prev in ("WD", "NS", "DNS", "W", "WITHDRAWN"):
        return "W"
    return "finished"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("meeting", help="meeting id or full shows URL")
    ap.add_argument("--out", required=True)
    ap.add_argument("--event-json", action="store_true")
    ap.add_argument("--series-map", default="{}",
                    help='JSON {class_no: series_key}, e.g. \'{"27":"pro-am-series"}\'')
    ap.add_argument("--event-name", default=None)
    ap.add_argument("--venue", default=None)
    ap.add_argument("--region", default=None)
    ap.add_argument("--skip-practice", action="store_true")
    args = ap.parse_args()

    m = re.search(r"(\d+)", args.meeting)
    if not m:
        sys.exit("cannot find meeting id in %r" % args.meeting)
    mid = m.group(1)
    try:
        series_map = json.loads(args.series_map)
    except json.JSONDecodeError as e:
        sys.exit("bad --series-map: %s" % e)

    sched = get_json("%s/api/v1/meetings/%s/schedule" % (BASE, mid))
    meeting_name = sched.get("display_name") or sched.get("name") or ("Equipe %s" % mid)
    classes = [c for c in sched.get("meeting_classes", [])
               if c.get("discipline") == "show_jumping"]
    print("[equipe] %s: %d show-jumping classes" % (meeting_name, len(classes)),
          file=sys.stderr)

    recs, skipped = [], []
    for cls in classes:
        name = (cls.get("name") or "").strip()
        cno = str(cls.get("class_no") or "")
        if args.skip_practice and "practice" in name.lower():
            skipped.append((cno, name, "practice skipped"))
            continue
        ctype, series = classify(name)
        if cno in series_map:
            series = series_map[cno]
        height = parse_height(cls.get("fence_height"))
        jo = bool(re.search(r"\bIJO\b|\bAM5\b|\b261\.", name, re.I))
        for sec in cls.get("class_sections", []) or []:
            if (sec.get("state") or "") not in ("results", "finished", "final"):
                # sections still running / startlists only
                continue
            try:
                detail = get_json("%s/api/v1/class_sections/%s"
                                  % (BASE, sec["id"]))
            except Exception as e:  # noqa: BLE001 - reported, not fatal
                skipped.append((cno, name, "section %s fetch: %s" % (sec.get("id"), e)))
                continue
            for s in detail.get("starts", []) or []:
                rider = (s.get("rider_name") or "").strip()
                horse = (s.get("horse_name") or "").strip()
                if not rider or not horse:
                    skipped.append((cno, name, "missing rider/horse"))
                    continue
                if not s.get("ridden", True):
                    skipped.append((cno, name, "DNS %s / %s" % (rider, horse)))
                    continue
                p1, p2 = phase_results(s)
                status = status_of(s, p1)
                # start number -> start_order (series nomination rule needs
                # it); non-numeric stays None = rule not applied.
                try:
                    start_order = int(str(s.get("start_no") or "").strip())
                except (ValueError, TypeError):
                    start_order = None
                if status != "finished":
                    # eliminated/retired/withdrawn: no placing, pens stay 0
                    # (repo convention), times nulled (999 never stored)
                    rec = {
                        "class_name": name,
                        "class_no": cno or None,
                        "class_type": ctype,
                        "class_date": cls.get("date"),
                        "rider_name": rider,
                        "horse_name": horse,
                        "placing": None,
                        "faults": 0,
                        "time_faults": 0,
                        "height_cm": height,
                        "status": status,
                        "series_key": series,
                        "start_order": start_order,
                    }
                else:
                    rec = {
                        "class_name": name,
                        "class_no": cno or None,
                        "class_type": ctype,
                        "class_date": cls.get("date"),
                        "rider_name": rider,
                        "horse_name": horse,
                        "placing": s.get("rank"),
                        "faults": clean_num(p1.get("fence_faults")) or 0,
                        "time": clean_num(p1.get("time")),
                        "time_faults": clean_num(p1.get("time_faults")) or 0,
                        "height_cm": height,
                        "status": status,
                        "series_key": series,
                        "start_order": start_order,
                        "prize": s.get("prize"),
                    }
                    if p2.get("fence_faults") is not None or p2.get("time") is not None:
                        if jo:
                            rec["jumpoff_faults"] = clean_num(p2.get("fence_faults")) or 0
                            rec["jumpoff_time"] = clean_num(p2.get("time"))
                        else:
                            rec["round2_faults"] = clean_num(p2.get("fence_faults")) or 0
                            rec["round2_time"] = clean_num(p2.get("time"))
                if "practice" in name.lower():
                    rec["notes"] = "practice round"
                recs.append({k: v for k, v in rec.items() if v is not None})

    out = {"event": {"name": args.event_name or meeting_name,
                     "venue": args.venue, "region": args.region},
           "records": recs} if args.event_json else recs
    with open(args.out, "w") as f:
        json.dump(out, f, indent=1)
    n_series = sum(1 for r in recs if r.get("series_key"))
    print("[equipe] wrote %d records (%d with series_key), %d skipped -> %s"
          % (len(recs), n_series, len(skipped), args.out), file=sys.stderr)
    for cno, name, why in skipped[:20]:
        print("  skip [%s] %s: %s" % (cno, name[:60], why), file=sys.stderr)


if __name__ == "__main__":
    main()
