"""Scraper base — EQIndex Step 3.

Rules (non-negotiable):
  1. robots.txt is enforced: disallowed paths are NEVER fetched.
  2. Crawl-delay from robots.txt is honoured (default 10s if absent).
  3. Polite UA identifying the project — no impersonating browsers/bots.
  4. Small volumes only. Per-round bulk data comes from EO-provided
     CSV/FEI exports (Step 2), never from hammering live timing sites.

Note: uses a minimal hand-rolled robots evaluator because stdlib
robotparser mis-handles the common allow-all form (`Disallow:` empty
-> denies everything). Semantics implemented: longest-prefix Disallow
match per the `*` group (plus any group naming eqindexbot).

Usage:
  from scrapers.base import polite_get, store_raw
"""
import sys
import time
from urllib.parse import urlparse

import requests
from psycopg.types.json import Json

UA = "EQIndexBot/0.1 (+horse-intelligence MVP; polite crawler, respects robots.txt)"
ROBOTS_CACHE = {}
LAST_HIT = {}


def _fetch_robots(host):
    """Returns (disallows: list[str], delay: float|None). Fail-open with warning."""
    try:
        resp = requests.get(f"https://{host}/robots.txt",
                            headers={"User-Agent": UA}, timeout=15)
        if resp.status_code != 200:
            print(f"[robots] {host}: HTTP {resp.status_code}, proceeding cautiously",
                  file=sys.stderr)
            return [], None
        body = resp.text
    except Exception as exc:  # noqa: BLE001 - network failure, fail open + warn
        print(f"[robots] {host}: unreachable ({exc}), proceeding cautiously",
              file=sys.stderr)
        return [], None

    disallows, delay, applies = [], None, False
    for raw in body.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            v = value.lower()
            applies = v == "*" or "eqindexbot" in v or v in UA.lower()
        elif applies and key == "disallow":
            if value:
                disallows.append(value)
        elif applies and key == "crawl-delay":
            try:
                delay = float(value)
            except ValueError:
                pass
    return disallows, delay


def _robots(host):
    if host not in ROBOTS_CACHE:
        ROBOTS_CACHE[host] = _fetch_robots(host)
    return ROBOTS_CACHE[host]


def allowed(url):
    path = urlparse(url).path or "/"
    disallows, _ = _robots(urlparse(url).netloc)
    return not any(path.startswith(d) for d in disallows)


def crawl_delay(url, default=10.0):
    _, delay = _robots(urlparse(url).netloc)
    return delay if delay else default


def polite_get(url, timeout=30):
    """GET respecting robots.txt + crawl-delay. Raises PermissionError if disallowed."""
    if not allowed(url):
        raise PermissionError(f"robots.txt disallows: {url}")
    host = urlparse(url).netloc
    wait = crawl_delay(url) - (time.time() - LAST_HIT.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    resp = requests.get(url, headers={"User-Agent": UA}, timeout=timeout)
    LAST_HIT[host] = time.time()
    resp.raise_for_status()
    return resp


def store_raw(cur, source, external_show_id, external_class_id, source_result_id, payload):
    """Insert one raw_results row (idempotent). Returns id or None if duplicate."""
    cur.execute(
        """INSERT INTO raw_results (source, external_show_id, external_class_id, source_result_id, payload)
           VALUES (%s,%s,%s,%s,%s)
           ON CONFLICT (source, external_class_id, source_result_id) DO NOTHING
           RETURNING id""",
        (source, external_show_id, external_class_id, source_result_id, Json(payload)),
    )
    row = cur.fetchone()
    return row[0] if row else None
