// Built-in class-name → series_key suggestions.
//
// Grounded in prod classes that already carry keys (e.g. 'Treadlite Premium
// Arenas Young Rider Series …' → young-rider-series). Conservative by design:
// ambiguous names (Main-Events, HOYQ, equitation, futurity, regional series
// with no vocab key) return null — those surface as "verify" instead.
// Mirror: ingest/series_keys.py — keep the two in sync.
const RULES = [
  [/pony\s*grand\s*prix/, 'pony-grand-prix-series'],
  [/\bgrand\s*prix\b/, 'grand-prix-series'],
  [/young\s*rider/, 'young-rider-series'],
  [/junior\s*rider/, 'junior-rider-series'],
  [/\bpro[-\s]?am\b/, 'pro-am-series'],
  [/amateur/, 'amateur-rider-series'],
  [/\btertiary\b/, 'tertiary-series'],
  [/premier\s*league/, 'premier-league-series'],
];

const YOUNG_HORSE = /young\s*horse|breeding/;
const YOUNG_AGE = /\b([567])\s*(?:y\.?o\.?|year[-\s]*old)\b/;
const YOUNG_SERIES = { 5: 'five-yo-series', 6: 'six-yo-series', 7: 'seven-yo-series' };

// Mentions a series-like concept but with no confident mapping — needs a
// human verdict (set a key or confirm non-series), never silent.
const LIKE = /series|grand\s*prix|mini\s*prix|pro[-\s]?am|young\s*rider|junior\s*rider|amateur|tertiary|premier\s*league|young\s*horse|breeding|futurity|equitation|hoyq|top of the south|main-event/i;

function suggestSeriesKey(className) {
  const n = String(className || '').toLowerCase();
  if (!n) return null;
  // Show-hunter national series (HOYQ / equitation / "National Series") share
  // words like "amateur"/"junior" but belong to a different sport — never map.
  if (/hoyq|equitation|hunter|\bnational\s*series\b/.test(n)) return null;
  for (const [re, key] of RULES) {
    if (re.test(n)) return key;
  }
  if (YOUNG_HORSE.test(n)) {
    const m = n.match(YOUNG_AGE);
    if (m) return YOUNG_SERIES[m[1]];
  }
  return null;
}

function seriesLike(className) {
  return LIKE.test(String(className || ''));
}

// Fill empty series_key from the class name. Returns {tagged, verify} where
// verify lists distinct class names that look series-like but matched nothing.
function autoTagRecords(records) {
  let tagged = 0;
  const verifySet = new Map();
  for (const r of records || []) {
    if (r.series_key) continue;
    const s = suggestSeriesKey(r.class_name);
    if (s) {
      r.series_key = s;
      r.series_suggested = true;
      tagged++;
    } else if (seriesLike(r.class_name)) {
      const name = String(r.class_name || 'Unnamed class');
      verifySet.set(name, (verifySet.get(name) || 0) + 1);
    }
  }
  return { tagged, verify: [...verifySet.entries()].map(([name, n]) => ({ name, rows: n })) };
}

module.exports = { suggestSeriesKey, seriesLike, autoTagRecords };
