"""Scraper: EvoEvents results site -> canonical import records.

The PDF print separates start lists (back+horse) from standings
(rider+numbers) with no reliable link. The per-class site pages carry the
FULL table (Back No | Horse | Rider | Place | pens | jump-off) in one row,
so scrape those instead.

Usage:
  ingest/.venv/bin/python ingest/scrapers/evoevents_site.py 2135888481 \\
    --date-start 2026-09-18 --date-end 2026-09-20 \\
    --series-map '{"9":"pro-am-series","10":"young-rider-series","11":"amateur-rider-series","12":"junior-rider-series","25":"pony-grand-prix-series"}' \\
    --event-name "Feilding Spring Show 2026" --venue Feilding \\
    --region Manawatu-Whanganui \\
    --out /tmp/feilding-records.json

Output: {"event": {...}, "records": [...]} ready for Admin -> CSV Import
(JSON mode, records array). Rows with no placing and no E/R status
(practice/schooling) are SKIPPED and counted, never imported silently.
"""
import argparse
import html as htmlmod
import json
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser

sys.path.insert(0, "ingest/providers")
from evoevents import classify, parse_height  # noqa: E402

BASE = "https://evoevents.co.nz"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


class ClassListParser(HTMLParser):
    """Collects per-class page hrefs (/results/<eid>/class/<cid>).

    Event landing pages link each class ("View full"); the Rider
    Alphabetical entry list is skipped (no placings). Class number+name
    come from each class page's own <title>/breadcrumb.
    """

    def __init__(self, eid):
        super().__init__()
        self.eid = eid
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href", "")
        m = re.fullmatch(r"/results/(\d+)/class/(\d+)", href)
        if m and m.group(1) == self.eid and href not in self.hrefs:
            self.hrefs.append(href)


class ScorecardParser(HTMLParser):
    """Reads table.results-scorecard into header + rows of cell text."""

    def __init__(self):
        super().__init__()
        self.in_table = False
        self.in_cell = False
        self.buf = ""
        self.row = []
        self.header = None
        self.rows = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table" and "results-scorecard" in a.get("class", ""):
            self.in_table = True
        if self.in_table and tag in ("td", "th"):
            self.in_cell = True
            self.buf = ""

    def handle_endtag(self, tag):
        if tag == "table":
            self.in_table = False
        if self.in_table and tag in ("td", "th"):
            self.in_cell = False
            self.row.append(re.sub(r"\s+", " ", htmlmod.unescape(self.buf)).strip())
        if self.in_table and tag == "tr" and self.row:
            if self.header is None and any("Back No" in c for c in self.row):
                self.header = self.row
            elif self.header is not None:
                self.rows.append(self.row)
            self.row = []

    def handle_data(self, data):
        if self.in_cell:
            self.buf += data


def num(tok):
    t = (tok or "").strip()
    if not t:
        return None
    try:
        return float(t) if "." in t else int(t)
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("event_id")
    ap.add_argument("--date-start", required=True)
    ap.add_argument("--date-end", required=True)
    ap.add_argument("--series-map", default="{}")
    ap.add_argument("--event-name", required=True)
    ap.add_argument("--venue", default=None)
    ap.add_argument("--region", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sleep", type=float, default=1.0)
    args = ap.parse_args()
    series_map = json.loads(args.series_map)

    eid = args.event_id
    first = fetch(f"{BASE}/results/{eid}")
    # event landing page links every class ("View full")
    cl = ClassListParser(eid)
    cl.feed(first)
    hrefs = cl.hrefs
    print(f"[evo-site] {len(hrefs)} class pages found", file=sys.stderr)

    recs, skipped, empty = [], [], []
    for href in hrefs:
        time.sleep(args.sleep)
        try:
            html = fetch(f"{BASE}{href}")
        except Exception as e:  # noqa: BLE001
            skipped.append(f"{href}: fetch failed ({e})")
            continue
        # class number + name from breadcrumb/title: "9 SEAHORSE ... — Event — Results"
        title = re.search(r"<title>(.*?)</title>", html, re.S)
        title = re.sub(r"\s+", " ", htmlmod.unescape(title.group(1))).strip() if title else ""
        core = title.split("—")[0].strip() if "—" in title else title
        m = re.match(r"(\d+)\s+(.*)", core)
        if m:
            cno, cname = m.group(1), m.group(2).strip()
        else:
            cno, cname = "", core
        if "rider alphabetical" in cname.lower():
            empty.append(f"class {cno} ({cname}): entry list, no placings — skipped")
            continue
        sc = ScorecardParser()
        sc.feed(html)
        if sc.header is None or not sc.rows:
            empty.append(f"class {cno} ({cname}): no table/entries")
            continue
        H = [h.lower() for h in sc.header]
        def col(*names):
            for n in names:
                if n in H:
                    return H.index(n)
            return None
        c_back, c_horse, c_rider = col("back no"), col("horse"), col("rider")
        c_place = col("place")
        c_time, c_tpen, c_jpen = col("sj time"), col("sj time pen"), col("sj jump pen")
        c_jo, c_jot, c_jotpen, c_jojpen = col("rnd 1 place"), col("jo time"), col("jo time pen"), col("jo jump pen")
        if c_horse is None or c_rider is None:
            skipped.append(f"class {cno} ({cname}): table lacks horse/rider columns")
            continue
        ctype, fmt = classify(cname)
        height = parse_height(cname)
        skey = series_map.get(cno)
        n_rows = 0
        for r in sc.rows:
            get = lambda i: r[i] if i is not None and i < len(r) else ""  # noqa: E731
            horse, rider = get(c_horse), get(c_rider)
            if not horse or not rider:
                continue
            cells = [get(c_place), get(c_time), get(c_tpen), get(c_jpen)]
            eliminated = any((c or "").strip() == "E" for c in r)
            retired = any((c or "").strip() == "R" for c in r)
            place = num(get(c_place))
            if place is None and not (eliminated or retired):
                skipped.append(f"class {cno}: practice/schooling row '{rider}' — skipped")
                continue
            status = "eliminated" if eliminated else "retired" if retired else "finished"
            finished = status == "finished"
            # prefix the class number: names repeat across classes (e.g. two
            # "1.10m Open Horse" classes) and the importer matches classes by
            # (event, name, date) — without this, twin classes merge and
            # shared pairs reject as duplicates with mixed placings.
            cname_full = f"{cno} {cname}" if cno else cname
            rec = {
                "class_name": cname_full, "class_type": ctype,
                "rider_name": rider, "horse_name": horse,
                "placing": int(place) if place is not None and finished else None,
                "faults": num(get(c_jpen)) if finished else None,
                "time_faults": num(get(c_tpen)) if finished else None,
                "time": num(get(c_time)) if finished else None,
                "status": status if not finished else None,
                "height_cm": height, "format": fmt,
                "event_name": args.event_name, "date_start": args.date_start,
                "date_end": args.date_end,
            }
            if args.venue:
                rec["venue"] = args.venue
            if args.region:
                rec["region"] = args.region
            if skey:
                rec["series_key"] = skey
            if finished and get(c_jotpen) not in (None, ""):
                rec["jumpoff_time"] = num(get(c_jot))
                rec["jumpoff_faults"] = num(get(c_jotpen))
                rec["notes"] = f"evo class {cno} final-round tail — placing kept as final"
            recs.append({k: v for k, v in rec.items() if v is not None})
            n_rows += 1
        print(f"[evo-site] class {cno} ({cname}): {n_rows} records", file=sys.stderr)

    out = {"event": {"name": args.event_name, "date_start": args.date_start,
                     "date_end": args.date_end},
           "records": recs}
    if args.venue:
        out["event"]["venue"] = args.venue
    if args.region:
        out["event"]["region"] = args.region
    with open(args.out, "w") as f:
        json.dump(out, f, indent=1)
    print(f"[evo-site] {len(recs)} records -> {args.out}", file=sys.stderr)
    print(f"skipped rows: {len(skipped)}; empty classes: {len(empty)}", file=sys.stderr)
    for s in skipped[:20]:
        print(f"  - {s}", file=sys.stderr)
    for s in empty:
        print(f"  . {s}", file=sys.stderr)


if __name__ == "__main__":
    main()
