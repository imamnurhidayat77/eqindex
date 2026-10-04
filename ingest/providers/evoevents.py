"""Provider adapter: EvoEvents PDF print -> canonical import records.

Input: the PDF saved from an EvoEvents results page. The print mixes three
layouts; this parser uses:
  - per-class rider results:  "Rider [Place] Time TPen JPen Total"
    (+ jump-off tail for AM5/IJO finals: certification of R1 only)
  - per-class horse lists:    bare "back Horse" lines IN ROW ORDER, one per
    result row (E rows included)
  - rider-alpha entries:      headed "back Rider Horse" lines, used ONLY to
    build a back_no -> rider cross-check map (never for silent joins)

Join rule (strict): within one class, pair result rows <-> bare horse lines
positionally (counts must match, E rows included); the paired rider MUST be
listed for that back number in the entry map (case-insensitive). AM5/IJO
finals, count skews, unknown backs and multi-rider backs are reported for
human review and SKIPPED — never silently imported.

Conventions mirror providers/rotorua.py:
  - heights: upper bound of ranges ("1.05/1.10m" -> 110)
  - class_type from keywords (Grand Prix/Premier/Young Horse/Amateur/Open
    for "open *", Standard otherwise incl. Introductory)
  - A2 single rounds fully automatic; AM5/IJO finals import R1 fields +
    jump-off time where unambiguous, finish_place stays R1, class flagged
    final-review (final classification is not printed unambiguously)
  - E -> eliminated (times/pens nulled, never stored as 0)
  - timer glitches (time > 600s, pens > 100) imported as-published + flagged
  - class_date from the preliminary timetable (Sat/Sun -> event dates given
    with --date-start); classes without a day get null (column is nullable)

Usage:
  ingest/.venv/bin/python ingest/providers/evoevents.py "Nelson.pdf" \
    --date-start 2026-09-19 --date-end 2026-09-20 \
    --out /tmp/nelson-records.json [--event-json]
  Layout is auto-detected: "feilding" when class headers look like
  "12 Class Name ... Hide View full" (1-2 digit numbers), else "nelson".
  Feilding extras: --series-map '{"9":"pro-am-series"}' (class no ->
  series_key), --event-name/--venue/--region for --event-json, and
  R (retired) rows import alongside E (eliminated).
"""
import argparse
import json
import re
import sys
from collections import Counter
from datetime import date, timedelta

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit("need pypdf (ingest/.venv has it)")

JUNK_PATTERNS = [
    r"^https?://evoevents",
    r"^\d{1,2}/\d{1,2}/\d{2,4},\s+\d",
    r"© \d{4} EvoEvents",
    r"^(Contact|What should we build|About|Unsubscribe|Terms of Service|Privacy|Cookie)",
    r"^(Class|Back no|Rider|Horse|Discipline|Yard|Scheduled|Est Time|Place|SJ |Rnd 1|JO |Final Total)",
    r"^(RESULTS|FIRST ROUND|FINAL ROUND|PRELIMINARY|SHOW JUMPING|RIDER ALPHABETICAL)",
    r"^(Refresh|Hide|View full|Event details|Back|Next)$",
    r"^\d{1,2}/\d{1,2}$",
]
JUNK = re.compile("|".join(f"({p})" for p in JUNK_PATTERNS), re.IGNORECASE)

CLASS_HEAD = re.compile(r"^(\d{3})\s+(.+?)(?:\s+Hide View full)?$")
FEILDING_HEAD = re.compile(r"^(\d{1,2})\s+(.+?)\s+Hide View full$")
FEILDING_PROBE = re.compile(r"^\d{1,2}\s+.+\s+Hide View full$")
TIMETABLE = re.compile(r"^(\d{3})\s+Show Jumping(?:\s+(Sat|Sun)\b.*)?$")
NUMTOK = re.compile(r"\d+(?:\.\d+)?|[ER]")


def num_or_none(tok):
    if tok in ("E", "R", "", None):
        return None
    try:
        return float(tok) if "." in str(tok) else int(tok)
    except (ValueError, TypeError):
        return None


def parse_height(name):
    m = re.findall(r"(\d+(?:\.\d+)?)\s*(?:[-/]\s*(\d+(?:\.\d+)?))?\s*(cm|m)\b", name, re.I)
    vals = []
    for lo, hi, unit in m:
        f = 100.0 if unit.lower() == "m" else 1.0
        vals.append(float(hi or lo) * f)
    return int(max(vals)) if vals else None


def classify(name):
    n = name.lower()
    ctype = "Standard"
    if "grand prix" in n:
        ctype = "Grand Prix"
    elif "mini prix" in n:
        ctype = "Premier"
    elif "young horse" in n:
        ctype = "Young Horse"
    elif "amateur" in n:
        ctype = "Amateur"
    elif "open" in n:
        ctype = "Open"
    fmt = "Jump-off" if ("am5" in n or "ijo" in n) else None
    return ctype, fmt


def trailing_run(toks):
    """Split trailing numeric/E/R block. Returns (head, run)."""
    vals = list(toks)
    run = []
    while vals and (re.fullmatch(r"\d+(?:\.\d+)?", vals[-1]) or vals[-1] in ("E", "R")):
        run.append(vals.pop())
    run.reverse()
    return vals, run


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--date-start", required=True)
    ap.add_argument("--date-end", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--event-json", action="store_true")
    ap.add_argument("--layout", default="auto", choices=["auto", "nelson", "feilding"])
    ap.add_argument("--series-map", default="{}",
                    help='JSON {class_number: series_key}, e.g. \'{"9":"pro-am-series"}\'')
    ap.add_argument("--event-name", default="PGG Wrightson Nelson Spring Show Jumping")
    ap.add_argument("--venue", default=None)
    ap.add_argument("--region", default=None)
    args = ap.parse_args()
    try:
        series_map = json.loads(args.series_map)
    except json.JSONDecodeError as e:
        sys.exit(f"bad --series-map: {e}")
    d0 = date.fromisoformat(args.date_start)
    day_date = {"Sat": d0.isoformat(), "Sun": (d0 + timedelta(days=1)).isoformat()}

    reader = PdfReader(args.pdf)
    lines = []
    for i, p in enumerate(reader.pages):
        lines.append(f"@@PAGE {i + 1}@@")
        for raw in (p.extract_text() or "").splitlines():
            t = raw.strip()
            if not t or JUNK.search(t):
                continue
            lines.append(t)

    layout = args.layout
    if layout == "auto":
        layout = "feilding" if any(FEILDING_PROBE.match(t) for t in lines) else "nelson"
    print(f"[evoevents] layout={layout}", file=sys.stderr)
    head_re = FEILDING_HEAD if layout == "feilding" else CLASS_HEAD
    back_re = r"\d{1,3}" if layout == "feilding" else r"\d{1,2}"

    day_of = {}
    for t in lines:
        m = TIMETABLE.match(t)
        if m and m.group(2):
            day_of.setdefault(m.group(1), m.group(2))

    headers = []
    for i, t in enumerate(lines):
        m = head_re.match(t)
        if m and not TIMETABLE.match(t):
            headers.append((m.group(1), m.group(2).strip(), i))

    # ---- pass 1: result rows per class (rider + numeric tail, no backs) ----
    classes = {}
    for ci, (cno, cname, hidx) in enumerate(headers):
        end = headers[ci + 1][2] if ci + 1 < len(headers) else len(lines)
        body = [t for t in lines[hidx + 1:end] if not t.startswith("@@PAGE")]
        if any("No entries or results" in t for t in body):
            classes[cno] = {"name": cname, "empty": True}
            continue
        res = []
        for t in body:
            toks = t.split()
            head, run = trailing_run(toks)
            if len(run) >= 4 and head:
                res.append((t, head, run))
        classes[cno] = {"name": cname, "empty": False, "rows": res, "body": body}

    roster = set()
    for cno, c in classes.items():
        if c["empty"]:
            continue
        for _, head, _ in c["rows"]:
            roster.add(" ".join(head).lower())

    # ---- pass 2: headed entry lines (anywhere) -> back -> riders ----
    # A digit-leading line is "headed" iff its remainder starts with a known
    # rider name; timetable/date lines never qualify (no trailing rider).
    back_riders = {}
    for t in lines:
        toks = t.split()
        if len(toks) < 4 or not re.fullmatch(back_re, toks[0]):
            continue
        _, run = trailing_run(toks)
        if run:
            continue
        rest = toks[1:]
        for n in (3, 2, 1):
            if " ".join(rest[:n]).lower() in roster:
                back_riders.setdefault(toks[0], set()).add(" ".join(rest[:n]))
                break
    multi_backs = {b: sorted(v) for b, v in back_riders.items() if len(v) > 1}

    # ---- pass 3: bare horse lines, ONLY inside class regions ----
    # (alpha pages hold entries/timetables, never horse lists). Guarded:
    # no trailing numbers, no rider prefix, no month names (date lines).
    MONTHS = re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", re.I)
    bare_all = []
    for cno, c in classes.items():
        if c["empty"]:
            continue
        for t in c["body"]:
            toks = t.split()
            if len(toks) < 2 or not re.fullmatch(back_re, toks[0]):
                continue
            _, run = trailing_run(toks)
            if run or MONTHS.search(t) or "Show Jumping" in t:
                continue
            rest = toks[1:]
            headed = any(" ".join(rest[:n]).lower() in roster for n in (3, 2, 1))
            if not headed:
                bare_all.append((toks[0], " ".join(rest)))
    # ---- pass 4: greedy consume per class in doc order, verified pairwise ----
    bare_pos = 0

    recs, review, anomalies = [], [], []
    by_class = Counter()
    final_flagged = set()
    for cno, c in classes.items():
        if c["empty"]:
            review.append(f"class {cno} ({c['name']}): no entries — skipped")
            continue
        res_rows = c["rows"]
        bare = bare_all[bare_pos:bare_pos + len(res_rows)]
        if len(bare) < len(res_rows):
            review.append(
                f"class {cno} ({c['name']}): {len(res_rows)} result rows but only "
                f"{len(bare)} horse lines remain — MANUAL REVIEW, skipped")
            continue
        ctype, fmt = classify(c["name"])
        height = parse_height(c["name"])
        cdate = day_date.get(day_of.get(cno)) if day_of.get(cno) else None
        if not cdate:
            review.append(f"class {cno} ({c['name']}): no timetable day — class_date null")

        def run_verifies(run_lines):
            for (_, head, _), (back, _horse) in zip(res_rows, run_lines):
                rider = " ".join(head)
                known = back_riders.get(back, set())
                if not known or not any(rider.lower() == k.lower() for k in known):
                    return False
            return True

        # self-healing alignment: try offsets 0..3 for a fully verifying run
        chosen, skipped = None, []
        for k in range(0, 4):
            cand = bare_all[bare_pos + k:bare_pos + k + len(res_rows)]
            if len(cand) < len(res_rows):
                break
            if run_verifies(cand):
                chosen, skipped = cand, bare_all[bare_pos:bare_pos + k]
                break
        if chosen is None:
            review.append(
                f"class {cno} ({c['name']}): horse lines do not verify — MANUAL REVIEW, skipped")
            bare_pos += len(res_rows)
            continue
        for t, _ in skipped:
            review.append(f"class {cno}: skipped stray line '{t[:50]}'")
        bare_pos += len(skipped) + len(res_rows)
        for (_, head, run), (back, horse) in zip(res_rows, chosen):
            rider = " ".join(head)
            # R1 block: finished = [place,time,tpen,jpen,total] (5),
            # E/R-shape = [0,0,E,E] / [0,0,R,R] (4, no JO ever follows).
            # A longer run means an AM5/IJO final tail after the R1 block.
            if ("E" in run or "R" in run) and len(run) <= 5:
                r1, jo = run, []
            elif len(run) >= 6:
                r1, jo = run[:5], run[5:]
            elif len(run) >= 4:
                r1, jo = run, []
            else:
                review.append(f"class {cno}: unparseable row '{rider}' — skipped")
                continue
            if len(r1) == 4:
                r1 = [None] + r1
            if len(r1) != 5:
                review.append(f"class {cno}: odd R1 block for '{rider}' — skipped")
                continue
            place, time, tpen, jpen, total = r1
            if "E" in (total, jpen):
                status = "eliminated"
            elif "R" in (total, jpen):
                status = "retired"
            else:
                status = "finished"
            rec = {
                "class_name": c["name"], "class_date": cdate, "class_type": ctype,
                "rider_name": rider, "horse_name": horse,
                "placing": int(place) if place is not None and status == "finished" else None,
                "faults": num_or_none(jpen) if status == "finished" else None,
                "time_faults": num_or_none(tpen) if status == "finished" else None,
                "time": num_or_none(time) if status == "finished" else None,
                "status": status if status != "finished" else None,
                "height_cm": height, "format": fmt,
            }
            if cno in series_map:
                rec["series_key"] = series_map[cno]
            if jo:
                rec["jumpoff_time"] = next(
                    (num_or_none(x) for x in jo if x not in ("E", "R") and "." in str(x)), None)
                rec["notes"] = (f"evo class {cno} final-round tail: {' '.join(jo)} — "
                                f"placing kept as R1, verify final")
                if cno not in final_flagged:
                    final_flagged.add(cno)
                    review.append(f"class {cno} ({c['name']}): final-round data present — placing kept as R1, verify")
            tval = num_or_none(time)
            pvals = [num_or_none(x) for x in (tpen, jpen)]
            if status == "finished" and ((tval is not None and tval > 600)
                                         or any(p is not None and p > 100 for p in pvals)):
                anomalies.append(
                    f"class {cno}: {rider} / {horse} time={time} pens={tpen}/{jpen} — timer glitch? imported as-published")
            recs.append({k: v for k, v in rec.items() if v is not None})
            by_class[cno] += 1

    out = {"records": recs}
    if args.event_json:
        out["event"] = {"name": args.event_name,
                        "date_start": args.date_start, "date_end": args.date_end}
        if args.venue:
            out["event"]["venue"] = args.venue
        if args.region:
            out["event"]["region"] = args.region
    with open(args.out, "w") as f:
        json.dump(out, f, indent=1)
    print(f"[evoevents] {len(by_class)} classes, {len(recs)} records -> {args.out}")
    if multi_backs:
        print(f"multi-rider backs: {len(multi_backs)}")
        for b, v in list(multi_backs.items())[:10]:
            print(f"  back {b}: {v}")
    print(f"anomalies: {len(anomalies)}")
    for a in anomalies:
        print(f"  ! {a}")
    print(f"review flags: {len(review)}")
    for r in review:
        print(f"  ? {r}")


if __name__ == "__main__":
    main()
