"""Seed mockup data for the Rankings page — season 2026-2027.

Adds deterministic, ADDITIVE data so /rankings matches the design mockup:
  8 horses (Kiwi Spirit, Ocean Star, Auckland Pride, Southern Cross,
  Highland Storm, Valley Thunder, Donaublick, Northern Light),
  6 riders (Sophie Bennett, James Wilson, Emma Clarke, Tom Richards,
  Sarah Cooper, Mark Thompson), 6 events / 48 classes, National/Elite
  levels, 150cm+ heights, non-empty breeders, demo watchlist rows.

Mock numbers are internally inconsistent in places (e.g. 32 rounds
together > 16 horse starts), so targets below are the closest INTEGER-
FEASIBLE set: horse table exact, rider order exact, combos ordered.

Idempotent: skips when 2026-2027 rounds exist; re-runs dedup via
(source, source_result_id). Flows through import_row like real CSVs.

Usage:
  ingest/.venv/bin/python ingest/seed_rankings_mock.py
"""
import os
import random
import sys

import psycopg

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from csv_import import import_row, load_dotenv  # noqa: E402
from normalize import normalize_name  # noqa: E402

rng = random.Random(2627)
SEASON = "2026-2027"
SOURCE = "CSV"

EVENTS = [
    ("Spring Opener", "2026-09-12", "2026-09-14", "Woodhill Sands", "Auckland", "Outdoor Turf"),
    ("Labour Weekend Jumping", "2026-10-24", "2026-10-26", "HB Showgrounds", "Hawke's Bay", "Grass Arena"),
    ("National Championship", "2026-12-10", "2026-12-13", "McLeans Island", "Canterbury", "Indoor Arena"),
    ("Elite Masters", "2027-01-14", "2027-01-17", "Mystery Creek", "Waikato", "Sand Arena"),
    ("Taranaki Summer Champs", "2027-01-28", "2027-01-31", "Taranaki Showgrounds", "Taranaki", "Grass Arena"),
    ("Season Final", "2027-02-11", "2027-02-14", "Glistening Waters", "Waikato", "Indoor Arena"),
]

CLASS_DEFS = [  # (name, height_cm, level, day_offset)
    ("National 110cm", 110, "National", 0),
    ("National 120cm A", 120, "National", 0),
    ("National 120cm B", 120, "National", 1),
    ("National 130cm", 130, "National", 1),
    ("Elite 130cm", 130, "Elite", 2),
    ("Elite 140cm", 140, "Elite", 2),
    ("Elite 150cm", 150, "Elite", 3),
    ("Grand Prix 155cm", 155, "Elite", 3),
]

HORSES_NEW = ["Ocean Star", "Auckland Pride", "Highland Storm",
              "Valley Thunder", "Donaublick", "Northern Light"]
HORSE_META = {  # breeder / gender / age / breed (page shows breeder + Stallion tag)
    "Kiwi Spirit": ("Elite Equine Ltd", "Stallion", 12, "Warmblood"),
    "Ocean Star": ("Elite Equine Ltd", "Mare", 11, "Warmblood"),
    "Auckland Pride": ("Elite Equine Ltd", "Gelding", 10, "NZ Sporthorse"),
    "Southern Cross": ("Southern Pastures", "Gelding", 13, "Thoroughbred X"),
    "Highland Storm": ("Highland Stud", "Stallion", 9, "Warmblood"),
    "Valley Thunder": ("Valley View Equestrian", "Gelding", 10, "NZ Sporthorse"),
    "Donaublick": ("Donaublick Farm", "Mare", 8, "Holsteiner"),
    "Northern Light": ("Northern Lights Stud", "Mare", 9, "Warmblood"),
}
RIDERS_NEW = [("James Wilson", "Auckland"), ("Emma Clarke", "Waikato"),
              ("Tom Richards", "Canterbury"), ("Sarah Cooper", "Hawke's Bay"),
              ("Mark Thompson", "Otago")]

# heights: {cm: (rounds, clears)} | faults: total fault values on non-clears
# tail: (clears, faults) in latest 5 rounds (trend control) | segments: (rider, rounds, clears, wins)
HORSE_PLANS = {
    "Kiwi Spirit": dict(heights={110: (5, 5), 120: (5, 5), 130: (6, 6)},
                        faults=[], wins=5, tail=(5, 0),
                        segments=[("Sophie Bennett", 16, 16, 5)]),
    "Ocean Star": dict(heights={120: (10, 10), 130: (8, 7), 140: (6, 3)},
                       faults=[8, 8, 8, 5], wins=3, tail=(4, 1),
                       segments=[("James Wilson", 20, 16, 2), ("Daniel McLeod", 4, 4, 1)]),
    "Auckland Pride": dict(heights={110: (1, 0), 120: (12, 11), 130: (12, 9), 140: (6, 4)},
                           faults=[8, 8, 8, 8, 8, 4, 2], wins=4, tail=(5, 0),
                           segments=[("Sarah Cooper", 20, 13, 4), ("Ruby Campbell", 11, 11, 0)]),
    "Southern Cross": dict(heights={120: (11, 9), 130: (11, 8), 140: (6, 4)},
                           faults=[8, 8, 8, 8, 8, 8, 2], wins=3, tail=(4, 1),
                           segments=[("Mark Thompson", 24, 17, 3), ("Ava Thompson", 4, 4, 0)]),
    "Highland Storm": dict(heights={120: (7, 4), 130: (9, 8), 140: (6, 4)},
                           faults=[8, 8, 8, 8, 8, 4], wins=2, tail=(4, 1),
                           segments=[("Emma Clarke", 18, 13, 1), ("Liam Carter", 4, 3, 1)]),
    "Valley Thunder": dict(heights={120: (8, 8), 130: (7, 4), 140: (5, 2)},
                           faults=[8, 8, 8, 8, 8, 4], wins=2, tail=(4, 1),
                           segments=[("Tom Richards", 18, 12, 2), ("Noah Williams", 2, 2, 0)]),
    "Donaublick": dict(heights={120: (6, 5), 130: (6, 4), 140: (6, 3)},
                       faults=[8, 8, 8, 8, 8, 3], wins=1, tail=(3, 2),
                       segments=[("James Wilson", 14, 9, 1), ("Henry Mitchell", 4, 3, 0)]),
    "Northern Light": dict(heights={120: (5, 4), 130: (5, 4), 140: (5, 2)},
                           faults=[12, 8, 8, 8, 6], wins=1, tail=(4, 1),
                           segments=[("Emma Clarke", 12, 8, 1), ("Mia Walker", 3, 2, 0)]),
}

# filler rounds topping riders up to mock totals: (rounds, clears, wins, fault values)
RIDER_FILLER = {
    "Sophie Bennett": (40, 24, 7, [5] * 16),
    "James Wilson": (14, 8, 5, [8, 8, 4, 4, 4, 5]),
    "Emma Clarke": (12, 6, 4, [8, 8, 4, 4, 4, 5]),
    "Sarah Cooper": (15, 8, 0, [8, 8, 6, 4, 4, 4, 4]),
    "Tom Richards": (20, 12, 3, [8, 8, 8, 8, 8, 4, 4, 4]),
    "Mark Thompson": (8, 2, 0, [8, 8, 8, 8, 8, 2]),
}
FILLER_HORSES = ["Willow Park", "Pohutukawa", "Rimu Grove", "Kowhai Gold",
                 "Tui Song", "Fern Hollow", "Aoraki Star", "Kauri King",
                 "Manuka Honey", "Pukeko Bay", "Weka Trail", "Nikau Palm",
                 "Kea Peak", "Moa Ridge"]
# dedicated tall-track horses so the 1.50m+ filter chip is non-empty (min 5)
TALL_HORSES = ["Huia Feather", "Kakapo Green", "Takahe Blue", "Albatross"]
TALL_SET = set(TALL_HORSES)
# spare dilution rounds for other riders (keep them below top-6): (rounds, clears, wins, faults)
SPARE = {
    "Ruby Campbell": (14, 3, 2, [8] * 8 + [4, 4, 3]),
    "Daniel McLeod": (10, 3, 2, [8, 8, 8, 8, 8, 4, 6]),
    "Ava Thompson": (8, 2, 1, [8, 8, 8, 8, 4, 6]),
    "Liam Carter": (8, 2, 1, [8, 8, 8, 8, 4, 6]),
    "Noah Williams": (6, 2, 1, [8, 8, 8, 6]),
    "Henry Mitchell": (6, 2, 1, [8, 8, 8, 8]),
    "Mia Walker": (6, 1, 0, [8, 8, 8, 4, 4]),
}

FAULT_SPLIT = {0: (0, 0), 2: (0, 2), 3: (0, 3), 4: (4, 0), 5: (4, 1),
               6: (4, 2), 8: (8, 0), 12: (12, 0)}


def main():
    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set (see .env)")
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT COUNT(*) FROM round_results rr
                           JOIN events e ON e.id = rr.event_id WHERE e.season = %s""", (SEASON,))
            if cur.fetchone()[0]:
                print(f"skip: season {SEASON} already seeded")
                return

        # ---- identity: horses / riders / owner ----
        with conn.transaction():
            with conn.cursor() as cur:
                for h in HORSES_NEW:
                    cur.execute("SELECT 1 FROM horses WHERE normalized_name = %s", (normalize_name(h),))
                    if not cur.fetchone():
                        cur.execute("INSERT INTO horses (name, normalized_name) VALUES (%s,%s)",
                                    (h, normalize_name(h)))
                for r, region in RIDERS_NEW:
                    cur.execute("SELECT 1 FROM riders WHERE normalized_name = %s", (normalize_name(r),))
                    if not cur.fetchone():
                        cur.execute("INSERT INTO riders (name, normalized_name, region) VALUES (%s,%s,%s)",
                                    (r, normalize_name(r), region))
                for h, (breeder, gender, age, breed) in HORSE_META.items():
                    cur.execute("""UPDATE horses SET breeder = %s, gender = %s, age = %s, breed = %s
                                   WHERE normalized_name = %s""",
                                (breeder, gender, age, breed, normalize_name(h)))
                cur.execute("""INSERT INTO users (name, email, role) VALUES
                               ('Elite Equine Ltd', 'elite@eqindex.local', 'OWNER')
                               ON CONFLICT (email) DO NOTHING""")
                cur.execute("""UPDATE horses SET owner_id = (SELECT id FROM users WHERE email = 'elite@eqindex.local')
                               WHERE normalized_name = %s""", (normalize_name("Kiwi Spirit"),))

        # ---- build class slots (deterministic) ----
        from datetime import date as ddate
        classes = []  # dicts: event..., class_name, class_date, height, level, key=(ei,ci)
        for ei, (name, ds, de, venue, region, arena) in enumerate(EVENTS):
            base = ddate.fromisoformat(ds)
            for ci, (cname, height, level, off) in enumerate(CLASS_DEFS):
                cd = base + __import__("datetime").timedelta(days=off)
                classes.append(dict(ei=ei, ci=ci, event_name=name, date_start=ds, date_end=de,
                                    venue=venue, region=region, arena=arena, class_name=cname,
                                    class_date=str(cd), height=height, level=level))
        by_height = {}
        for c in classes:
            by_height.setdefault(c["height"], []).append(c)  # chronological already

        # sanity: capacities
        for hname, p in HORSE_PLANS.items():
            assert sum(n for n, _ in p["heights"].values()) == sum(s[1] for s in p["segments"]), hname
            assert sum(c for _, c in p["heights"].values()) == sum(s[2] for s in p["segments"]), hname
            assert sum(s[3] for s in p["segments"]) == p["wins"], hname
            assert len(p["faults"]) == sum(n for n, _ in p["heights"].values()) - sum(
                c for _, c in p["heights"].values()), hname
            for h, (n, _) in p["heights"].items():
                assert n <= len(by_height[h]), (hname, h)

        # ---- assign mock rounds to classes ----
        slots = []  # {cls, horse, clear, fault, rider, win}
        for hi, (hname, p) in enumerate(HORSE_PLANS.items()):
            hslots = []
            for h, (n, _) in p["heights"].items():
                pool = by_height[h]
                off = (hi * 3) % len(pool)
                for k in range(n):
                    hslots.append({"cls": pool[(off + k) % len(pool)], "horse": hname,
                                   "height": h, "clear": None, "fault": 0,
                                   "rider": None, "win": False})
            hslots.sort(key=lambda s: (s["cls"]["class_date"], s["cls"]["ei"], s["cls"]["ci"]))
            # flags: tail first (counts only — tie-safe), then per-height quotas
            need_f = {h: n - c for h, (n, c) in p["heights"].items()}
            tail, rest = hslots[-5:], hslots[:-5]
            t_clear, t_fault = p["tail"]
            # F slots: latest tail slots whose height still needs faults
            cands = sorted(tail, key=lambda s: (s["cls"]["class_date"], s["cls"]["ei"],
                                                s["cls"]["ci"]), reverse=True)
            placed_f = 0
            for s in cands:
                if placed_f < t_fault and need_f[s["height"]] > 0:
                    s["clear"] = False
                    need_f[s["height"]] -= 1
                    placed_f += 1
                else:
                    s["clear"] = True
            for s in cands:  # top-up if quota forced fewer (keeps totals exact)
                if placed_f < t_fault and s["clear"]:
                    s["clear"] = False
                    need_f[s["height"]] -= 1
                    placed_f += 1
            rem_f = len(p["faults"]) - placed_f
            for s in rest:
                if rem_f > 0 and need_f[s["height"]] > 0:
                    s["clear"] = False
                    need_f[s["height"]] -= 1
                    rem_f -= 1
                else:
                    s["clear"] = True
            for s in rest:  # force leftovers (exact totals win over height quotas)
                if rem_f > 0 and s["clear"]:
                    s["clear"] = False
                    need_f[s["height"]] -= 1
                    rem_f -= 1
            assert rem_f == 0, hname
            flist = p["faults"][:]
            rng.shuffle(flist)
            it = iter(flist)
            for s in hslots:
                if not s["clear"]:
                    s["fault"] = next(it)
            # riders per segment (T/F aware, exact counts)
            free = hslots[:]
            for rider, n, c, w in p["segments"]:
                tpool = [s for s in free if s["clear"]]
                fpool = [s for s in free if not s["clear"]]
                assert len(tpool) >= c and len(fpool) >= n - c, (hname, rider)
                pick = tpool[:c] + fpool[: (n - c)]
                for s in pick:
                    s["rider"] = rider
                    free.remove(s)
            assert not free, hname
            slots.extend(hslots)

        # ---- wins: distinct class per win, on clear rounds, per (horse, rider) ----
        used_win_class = set()
        for hname, p in HORSE_PLANS.items():
            for rider, _n, _c, w in p["segments"]:
                need = w
                cands = [s for s in slots if s["horse"] == hname and s["rider"] == rider
                         and s["clear"] and not s["win"]]
                for s in cands:
                    if need == 0:
                        break
                    key = (s["cls"]["ei"], s["cls"]["ci"])
                    if key not in used_win_class:
                        s["win"] = True
                        used_win_class.add(key)
                        need -= 1
                assert need == 0, (hname, rider)

        # ---- filler + spare rounds ----
        class_count = {(c["ei"], c["ci"]): 0 for c in classes}
        class_horses = {(c["ei"], c["ci"]): set() for c in classes}
        for s in slots:
            key = (s["cls"]["ei"], s["cls"]["ci"])
            class_count[key] += 1
            class_horses[key].add(s["horse"])
        CAP = 12
        extras = []  # slots with rider plans incl. wins
        fi = 0
        order = sorted(classes, key=lambda c: (c["class_date"], c["ei"], c["ci"]))
        ptr = 0

        def place(n, rider, clears, wins, faults, horses, clear_totals):
            nonlocal ptr, fi
            tall_i = place.tall_i
            made = []
            for _ in range(n):
                for _ in range(len(order) * 4):
                    c = order[ptr % len(order)]
                    ptr += 1
                    key = (c["ei"], c["ci"])
                    if class_count[key] >= CAP:
                        continue
                    pool = TALL_HORSES if c["height"] >= 150 else horses
                    if pool is TALL_HORSES:
                        idx, step = tall_i, len(pool)
                    else:
                        idx, step = fi, len(pool)
                    pick = None
                    for k in range(len(pool)):
                        h = pool[(idx + k) % len(pool)]
                        if h not in class_horses[key]:
                            pick, used = h, k + 1
                            break
                    if pick is None:
                        continue
                    if pool is TALL_HORSES:
                        tall_i += used
                    else:
                        fi += used
                    class_count[key] += 1
                    class_horses[key].add(pick)
                    made.append({"cls": c, "horse": pick, "height": c["height"],
                                 "clear": None, "fault": 0, "rider": rider, "win": False})
                    break
                else:
                    raise AssertionError("no class space")
            place.tall_i = tall_i
            fl = faults[:]
            rng.shuffle(fl)
            # clears: greedy-balanced across filler horses (fewest clears first)
            # so no filler accidentally cracks the top-8
            ranked = sorted(made, key=lambda s: (clear_totals.get(s["horse"], 0),
                                                 s["cls"]["class_date"]))
            for s in ranked[:clears]:
                s["clear"] = True
                clear_totals[s["horse"]] = clear_totals.get(s["horse"], 0) + 1
            for s in ranked[clears:]:
                s["clear"] = False
            got = 0
            for s in [m for m in made if m["clear"]]:
                if got >= wins:
                    break
                key = (s["cls"]["ei"], s["cls"]["ci"])
                if key not in used_win_class:
                    s["win"] = True
                    used_win_class.add(key)
                    got += 1
            if got < wins:
                for s in [m for m in made if m["clear"] and not m["win"]]:
                    if got >= wins:
                        break
                    skey = (s["cls"]["ei"], s["cls"]["ci"])
                    if skey in used_win_class:
                        for t in [m for m in made if not m["clear"]]:
                            tkey = (t["cls"]["ei"], t["cls"]["ci"])
                            if tkey not in used_win_class:
                                s["clear"], t["clear"] = False, True
                                t["win"] = True
                                used_win_class.add(tkey)
                                got += 1
                                break
            if got < wins:
                # last resort: relocate a clear slot into a free class
                # with space (counts preserved everywhere)
                for s in [m for m in made if m["clear"] and not m["win"]]:
                    if got >= wins:
                        break
                    for c in order:
                        tkey = (c["ei"], c["ci"])
                        if tkey in used_win_class or class_count[tkey] >= CAP:
                            continue
                        if s["horse"] in class_horses[tkey]:
                            continue
                        okey = (s["cls"]["ei"], s["cls"]["ci"])
                        class_count[okey] -= 1
                        class_horses[okey].discard(s["horse"])
                        class_count[tkey] += 1
                        class_horses[tkey].add(s["horse"])
                        s["cls"] = c
                        s["height"] = c["height"]
                        s["win"] = True
                        used_win_class.add(tkey)
                        got += 1
                        break
            assert got == wins, rider
            fvals = fl[:]
            for s in made:
                if not s["clear"]:
                    s["fault"] = fvals.pop()
            assert not fvals, rider
            return made

        filler_clear_totals = {}
        place.tall_i = 0
        for rider, (n, c, w, fl) in RIDER_FILLER.items():
            assert len(fl) == n - c, rider
            extras.extend(place(n, rider, c, w, fl, FILLER_HORSES, filler_clear_totals))
        for rider, (n, c, w, fl) in SPARE.items():
            assert len(fl) == n - c, rider
            extras.extend(place(n, rider, c, w, fl, FILLER_HORSES, filler_clear_totals))
        slots.extend(extras)
        assert len(used_win_class) == len(classes), \
            f"win classes {len(used_win_class)} != {len(classes)}"

        # ---- balance: no filler may display above Northern Light (eq 76).
        # Swap a non-win clear with a same-rider faulted round on the
        # weakest filler horse (rider totals + wins untouched).
        def _eq(r, c, f):
            return 45 + 50 * c / r - 2.5 * f / r + min(r, 20) * 0.3 if r else 0

        for _ in range(50):
            aggr = {}
            for s in extras:
                a = aggr.setdefault(s["horse"], [0, 0, 0])
                a[0] += 1
                a[1] += 1 if s["clear"] else 0
                a[2] += 0 if s["clear"] else s["fault"]
            bad = [h for h, (r, c, f) in aggr.items() if r >= 5 and _eq(r, c, f) >= 75.5]
            if not bad:
                break
            bad.sort(key=lambda h: -_eq(*aggr[h]))
            h = bad[0]
            donors = [s for s in extras if s["horse"] == h and s["clear"] and not s["win"]]
            assert donors, h
            d = donors[0]
            cands = [s for s in extras if s["rider"] == d["rider"] and not s["clear"]
                     and not s["win"] and s["horse"] != h]
            cands.sort(key=lambda s: _eq(*aggr[s["horse"]]))
            assert cands, d["rider"]
            t = cands[0]
            d["clear"], t["clear"] = False, True
            d["fault"], t["fault"] = t["fault"], 0
        else:
            raise AssertionError("balance fixpoint did not converge")
        aggr = {}
        for s in extras:
            a = aggr.setdefault(s["horse"], [0, 0, 0])
            a[0] += 1
            a[1] += 1 if s["clear"] else 0
            a[2] += 0 if s["clear"] else s["fault"]
        worst = sorted(((_eq(r, c, f), h, r, c) for h, (r, c, f) in aggr.items()
                        if r >= 5), reverse=True)[:4]
        print("TOP FILLERS:", [(h, round(e, 1), r, c) for e, h, r, c in worst])

        # ---- times + places per class ----
        rows = []
        for c in classes:
            key = (c["ei"], c["ci"])
            starters = [s for s in slots if (s["cls"]["ei"], s["cls"]["ci"]) == key]
            assert starters, c["class_name"]
            winners = [s for s in starters if s["win"]]
            assert len(winners) == 1, (c["class_name"], len(winners))
            w = winners[0]
            assert w["fault"] == 0
            wt = round(65 + rng.random() * 2, 2)
            w["time"] = wt
            for s in starters:
                if not s["win"]:
                    s["time"] = round(wt + 0.5 + rng.random() * 15, 2)
            starters.sort(key=lambda s: (s["fault"], s["time"]))
            for i, s in enumerate(starters, 1):
                s["place"] = i
            assert w["place"] == 1
            for s in starters:
                jf, tf = FAULT_SPLIT[s["fault"]]
                rows.append({
                    "event_name": c["event_name"], "date_start": c["date_start"],
                    "date_end": c["date_end"], "venue": c["venue"], "venue_country": "NZL",
                    "region": c["region"], "arena_type": c["arena"], "season": SEASON,
                    "class_name": c["class_name"], "class_date": c["class_date"],
                    "height_cm": str(c["height"]), "level": c["level"],
                    "rider": s["rider"], "horse": s["horse"],
                    "jump_faults": str(jf), "time_faults": str(tf),
                    "time_seconds": f"{s['time']:.2f}", "finish_place": str(s["place"]),
                    "source_result_id": f"mock2627-e{c['ei']}c{c['ci']}-{normalize_name(s['horse'])}-{normalize_name(s['rider'])}",
                })

        # ---- import through production path ----
        stats = {"inserted": 0, "skipped": 0, "failed": 0}
        with conn.transaction():
            with conn.cursor() as cur:
                for r in rows:
                    stats[import_row(cur, r, SOURCE)] += 1
                e0 = EVENTS[0][0]
                cur.execute("""UPDATE classes c SET field_size = t.n, updated_at = NOW()
                               FROM (SELECT class_id, COUNT(*) n FROM round_results GROUP BY 1) t
                               WHERE c.id = t.class_id
                               AND c.event_id IN (SELECT id FROM events WHERE season = %s)""", (SEASON,))

        # ---- watchlist for demo user ----
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM users WHERE email = 'admin@eqindex.local'")
                admin = cur.fetchone()
                uid = admin[0] if admin else None
                if uid:
                    for etype, name in (("horse", "Kiwi Spirit"), ("rider", "Sophie Bennett")):
                        table = "horses" if etype == "horse" else "riders"
                        cur.execute(f"SELECT id FROM {table} WHERE normalized_name = %s",
                                    (normalize_name(name),))
                        eid = cur.fetchone()[0]
                        cur.execute("""INSERT INTO watchlist_items (user_id, entity_type, entity_id, note)
                                       VALUES (%s,%s,%s,%s)
                                       ON CONFLICT (user_id, entity_type, entity_id)
                                       DO UPDATE SET note = EXCLUDED.note""",
                                    (uid, etype, eid, "Rankings mockup spotlight"))

        print(f"rows={len(rows)} inserted={stats['inserted']} skipped={stats['skipped']} failed={stats['failed']}")

        # ---- verification ----
        with conn.cursor() as cur:
            cur.execute("""SELECT h.name, COUNT(*) starts,
                           ROUND(100.0*AVG(rr.clear_round::INT),1) clear_pct,
                           ROUND(AVG(rr.total_faults),2) avg_f,
                           COUNT(*) FILTER (WHERE rr.finish_place = 1) wins
                           FROM round_results rr JOIN horses h ON h.id = rr.horse_id
                           JOIN events e ON e.id = rr.event_id
                           WHERE e.season = %s AND h.name IN ('Kiwi Spirit','Ocean Star','Auckland Pride',
                             'Southern Cross','Highland Storm','Valley Thunder','Donaublick','Northern Light')
                           GROUP BY 1 ORDER BY clear_pct DESC""", (SEASON,))
            print("HORSES:", cur.fetchall())
            cur.execute("""SELECT r.name, COUNT(*) starts,
                           ROUND(100.0*AVG(rr.clear_round::INT),1) clear_pct,
                           COUNT(*) FILTER (WHERE rr.finish_place = 1) wins
                           FROM round_results rr JOIN riders r ON r.id = rr.rider_id
                           JOIN events e ON e.id = rr.event_id
                           WHERE e.season = %s AND r.name IN ('Sophie Bennett','James Wilson','Emma Clarke',
                             'Tom Richards','Sarah Cooper','Mark Thompson')
                           GROUP BY 1 ORDER BY clear_pct DESC""", (SEASON,))
            print("RIDERS:", cur.fetchall())
            cur.execute("""SELECT h.name, COUNT(*) s,
                           45 + AVG(rr.clear_round::INT)*50 - AVG(rr.total_faults)*2.5
                             + LEAST(COUNT(*),20)*0.3 AS eq
                           FROM round_results rr JOIN horses h ON h.id = rr.horse_id
                           JOIN events e ON e.id = rr.event_id
                           WHERE e.season = %s AND h.name NOT IN ('Kiwi Spirit','Ocean Star',
                             'Auckland Pride','Southern Cross','Highland Storm','Valley Thunder',
                             'Donaublick','Northern Light')
                           GROUP BY 1 HAVING 45 + AVG(rr.clear_round::INT)*50
                             - AVG(rr.total_faults)*2.5 + LEAST(COUNT(*),20)*0.3 >= 75.5""", (SEASON,))
            intruders = cur.fetchall()
            print("HORSE INTRUDERS (eq>=75.5):", intruders)
            cur.execute("""SELECT r.name, COUNT(*) s,
                           45 + AVG(rr.clear_round::INT)*50 - AVG(rr.total_faults)*2.5
                             + LEAST(COUNT(*),20)*0.3 AS eq
                           FROM round_results rr JOIN riders r ON r.id = rr.rider_id
                           JOIN events e ON e.id = rr.event_id
                           WHERE e.season = %s AND r.name NOT IN ('Sophie Bennett','James Wilson',
                             'Emma Clarke','Tom Richards','Sarah Cooper','Mark Thompson')
                           GROUP BY 1 HAVING 45 + AVG(rr.clear_round::INT)*50
                             - AVG(rr.total_faults)*2.5 + LEAST(COUNT(*),20)*0.3 >= 74""", (SEASON,))
            rintruders = cur.fetchall()
            print("RIDER INTRUDERS (eq>=74):", rintruders)
            if intruders or rintruders:
                raise SystemExit("seed guard failed: filler outranks mock")


if __name__ == "__main__":
    main()
