"""Built-in class-name -> series_key suggestions.

Grounded in prod classes that already carry keys. Conservative: ambiguous
names return None (surface as verify, never silent).
Mirror: api/src/lib/seriesKeys.js — keep the two in sync.
"""
import re

RULES = [
    (re.compile(r'pony\s*grand\s*prix'), 'pony-grand-prix-series'),
    (re.compile(r'\bgrand\s*prix\b'), 'grand-prix-series'),
    (re.compile(r'young\s*rider'), 'young-rider-series'),
    (re.compile(r'junior\s*rider'), 'junior-rider-series'),
    (re.compile(r'\bpro[-\s]?am\b'), 'pro-am-series'),
    (re.compile(r'amateur'), 'amateur-rider-series'),
    (re.compile(r'\btertiary\b'), 'tertiary-series'),
    (re.compile(r'premier\s*league'), 'premier-league-series'),
]

YOUNG_HORSE = re.compile(r'young\s*horse|breeding')
YOUNG_AGE = re.compile(r'\b([567])\s*(?:y\.?o\.?|year[-\s]*old)\b')
YOUNG_SERIES = {'5': 'five-yo-series', '6': 'six-yo-series', '7': 'seven-yo-series'}

LIKE = re.compile(
    r'series|grand\s*prix|mini\s*prix|pro[-\s]?am|young\s*rider|junior\s*rider'
    r'|amateur|tertiary|premier\s*league|young\s*horse|breeding|futurity'
    r'|equitation|hoyq|top of the south|main-event', re.I)


HUNTER = re.compile(r'hoyq|equitation|hunter|\bnational\s*series\b')


def suggest_series_key(class_name):
    n = (class_name or '').lower()
    if not n:
        return None
    # Show-hunter national series share words like "amateur"/"junior" but
    # belong to a different sport — never map.
    if HUNTER.search(n):
        return None
    for rx, key in RULES:
        if rx.search(n):
            return key
    if YOUNG_HORSE.search(n):
        m = YOUNG_AGE.search(n)
        if m:
            return YOUNG_SERIES[m.group(1)]
    return None


def series_like(class_name):
    return bool(LIKE.search(class_name or ''))
