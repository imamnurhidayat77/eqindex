"""Weather backfill — EQIndex spec v2 §12 (weather at class level).

Source: Open-Meteo archive API (free, no key). One row per venue+date in
weather_cache. Daily aggregates are labelled is_estimate=TRUE; when a class
has start_time we pin the nearest hour and mark is_estimate=FALSE.

Three data types stay separate (never conflated):
  measured  — this script (weather service),
  reported  — organiser-entered arena fields (classes.*),
  calculated — classification below (EQIndex interpretation).

Venue coordinates: curated NZ map first, region centroid second,
Open-Meteo geocoding last resort. Polite: ~1 request / 2s.

Usage:
  ingest/.venv/bin/python ingest/weather.py [--limit N] [--dry-run]
"""
import argparse
import os
import sys
import time
from datetime import date

import psycopg
import requests

UA = "EQIndexBot/0.1 (+weather backfill; contact via repo)"
GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

# Curated NZ venue coordinates (verify before trusting blindly).
VENUES = {
    "mystery creek": (-37.784, 175.606),
    "woodhill sands": (-36.680, 174.450),
    "mcleans island": (-43.467, 172.467),
    "taranaki showgrounds": (-39.060, 174.070),
    "canterbury agricultural park": (-43.550, 172.630),
    "hb showgrounds": (-39.650, 176.840),
    "hawke's bay showgrounds": (-39.650, 176.840),
    "national equestrian centre": (-38.690, 176.070),
}
REGION_FALLBACK = {
    "waikato": (-37.780, 175.300),
    "auckland": (-36.850, 174.760),
    "canterbury": (-43.530, 172.630),
    "taranaki": (-39.060, 174.070),
    "hawke's bay": (-39.650, 176.840),
}


def classify(temp, rain, wind):
    tags = []
    if rain is not None and rain >= 2:
        tags.append("wet")
    if wind is not None and wind >= 30:
        tags.append("windy")
    if temp is not None and temp >= 28:
        tags.append("hot")
    if temp is not None and temp <= 5:
        tags.append("cold")
    return "+".join(tags) if tags else "dry"


def geocode(name):
    try:
        r = requests.get(GEOCODE, params={"name": f"{name} New Zealand", "count": 1},
                         headers={"User-Agent": UA}, timeout=15)
        res = (r.json().get("results") or [None])[0]
        if res:
            return float(res["latitude"]), float(res["longitude"])
    except Exception as exc:  # noqa: BLE001
        print(f"[geo] {name}: {exc}", file=sys.stderr)
    return None


def coords_for(venue, region):
    v = (venue or "").strip().lower()
    if v in VENUES:
        return VENUES[v], "curated"
    hit = geocode(venue)
    if hit:
        return hit, "geocoded"
    fb = REGION_FALLBACK.get((region or "").strip().lower())
    if fb:
        return fb, "region-fallback"
    return None, "unknown"


def fetch_day(lat, lon, day):
    r = requests.get(ARCHIVE, params={
        "latitude": lat, "longitude": lon,
        "start_date": day.isoformat(), "end_date": day.isoformat(),
        "hourly": "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m,relative_humidity_2m",
        "timezone": "Pacific/Auckland",
    }, headers={"User-Agent": UA}, timeout=30)
    r.raise_for_status()
    h = r.json()["hourly"]
    return h


def summarise(h, hour=None):
    n = len(h["time"])
    idx = range(n)
    est = True
    if hour is not None:
        best = min(range(n), key=lambda i: abs(i - hour))
        idx = [best]
        est = False
    pick = lambda k: [x for i in idx if (x := h[k][i]) is not None]
    avg = lambda vs: sum(vs) / len(vs) if vs else None
    return {
        "temp_c": avg(pick("temperature_2m")),
        "rainfall_mm": sum(pick("precipitation")) if pick("precipitation") else 0,
        "wind_kph": max(pick("wind_speed_10m")) if pick("wind_speed_10m") else None,
        "wind_dir_deg": pick("wind_direction_10m")[-1] if pick("wind_direction_10m") else None,
        "humidity_pct": round(avg(pick("relative_humidity_2m"))) if pick("relative_humidity_2m") else None,
        "is_estimate": est,
    }


def load_dotenv(path=".env"):
    # repo root .env (two levels up from ingest/) or cwd
    cands = [path,
             os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")]
    for c in cands:
        if os.path.exists(c):
            with open(c) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
            return


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    load_dotenv()
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL not set")
    conn = psycopg.connect(db_url, autocommit=True)
    rows = conn.execute(
        """SELECT DISTINCT e.venue, e.region, c.class_date::date AS d
           FROM classes c JOIN events e ON e.id = c.event_id
           WHERE c.class_date IS NOT NULL
             AND c.class_date < CURRENT_DATE - INTERVAL '5 days' -- ERA5 archive lag; future needs forecast, not history
             AND NOT EXISTS (SELECT 1 FROM weather_cache w
                             WHERE w.venue_norm = lower(trim(e.venue)) AND w.date = c.class_date::date)
           ORDER BY d DESC LIMIT %s""", (args.limit,)).fetchall()
    print(f"[weather] {len(rows)} venue-dates to fill")
    done = 0
    for venue, region, day in rows:
        (latlon, how) = coords_for(venue, region)
        if not latlon:
            print(f"[weather] SKIP {venue} {day} (no coords)")
            continue
        lat, lon = latlon
        try:
            h = fetch_day(lat, lon, day)
            s = summarise(h)
            cls = classify(s["temp_c"], s["rainfall_mm"], s["wind_kph"])
            print(f"[weather] {venue} {day}: {s['temp_c'] and round(s['temp_c'],1)}C "
                  f"rain={s['rainfall_mm']} wind={s['wind_kph']} -> {cls} ({how}{' est' if s['is_estimate'] else ''})")
            if not args.dry_run:
                conn.execute(
                    """INSERT INTO weather_cache
                       (venue_norm, date, temp_c, rainfall_mm, wind_kph, wind_dir_deg,
                        humidity_pct, classification, lat, lon, is_estimate)
                       VALUES (lower(trim(%s)), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT DO NOTHING""",
                    (venue, day, s["temp_c"], s["rainfall_mm"], s["wind_kph"],
                     s["wind_dir_deg"], s["humidity_pct"], cls, lat, lon, s["is_estimate"]))
                done += 1
        except Exception as exc:  # noqa: BLE001
            print(f"[weather] FAIL {venue} {day}: {exc}", file=sys.stderr)
        time.sleep(2)
    print(f"[weather] stored {done}")


if __name__ == "__main__":
    main()
