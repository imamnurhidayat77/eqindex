// AI fallback for the Import Assistant — Muse Spark via the Go
// subscription (server-to-server; the key never reaches the browser).
// Used ONLY when deterministic rules can't map an organiser file.
// Every AI-mapped row still goes through dry-run preview + human Commit.
const KEY = process.env.OPENCODE_GO_API_KEY || process.env.ZEN_API_KEY || '';
const BASE = 'https://opencode.ai/zen/go/v1';
const MODEL = process.env.AI_MODEL || 'muse-spark-1.3-contributor';

function extractText(j) {
  if (typeof j.output_text === 'string' && j.output_text) return j.output_text;
  const parts = [];
  for (const item of j.output || []) {
    for (const c of item.content || []) {
      if (typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('\n');
}

async function aiJsonArray({ input, maxTokens = 4000, session }) {
  if (!KEY) throw new Error('AI not configured — set OPENCODE_GO_API_KEY on the API service');
  const res = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: {
      'User-Agent': 'eqindex-import/1.0',
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'x-opencode-session': session || `import-${Date.now().toString(36)}`,
    },
    body: JSON.stringify({ model: MODEL, input, max_output_tokens: maxTokens }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}) ${t.slice(0, 120)}`);
  }
  const text = extractText(await res.json());
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a < 0 || b <= a) throw new Error('AI did not return a JSON array');
  return JSON.parse(text.slice(a, b + 1));
}

async function aiChat({ system, messages, maxTokens = 800, session }) {
  if (!KEY) throw new Error('AI not configured — set OPENCODE_GO_API_KEY on the API service');
  const input = `${system}\n\n${messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')}\n\nAssistant:`;
  const res = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: {
      'User-Agent': 'eqindex-import/1.0',
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'x-opencode-session': session || `chat-${Date.now().toString(36)}`,
    },
    body: JSON.stringify({ model: MODEL, input: input.slice(0, 15000), max_output_tokens: maxTokens }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}) ${t.slice(0, 120)}`);
  }
  return extractText(await res.json()).trim();
}

const CANON_KEYS = ['class_name', 'class_type', 'class_date', 'rider_name', 'horse_name',
  'placing', 'faults', 'time', 'time_faults', 'height_cm', 'format', 'status', 'notes',
  'series_key', 'start_order', 'breed', 'age', 'gender', 'sire', 'dam', 'breeder', 'country',
  'region', 'rider_region', 'nationality', 'venue', 'venue_country', 'arena_type',
  'event_name', 'date_start', 'date_end'];

function cleanRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const req = ['class_name', 'rider_name', 'horse_name']
    .every((k) => String(r[k] || '').trim());
  if (!req) return null;
  const out = {};
  for (const k of CANON_KEYS) {
    if (r[k] === undefined || r[k] === null || r[k] === '') continue;
    out[k] = r[k];
  }
  for (const k of ['placing', 'faults', 'time', 'time_faults', 'height_cm', 'start_order', 'age']) {
    if (out[k] !== undefined) {
      const n = Number(String(out[k]).replace(',', '.'));
      if (!Number.isFinite(n)) delete out[k];
      else out[k] = n;
    }
  }
  return out;
}

// Map free-form organiser results text to canonical import records.
async function aiMapRecords({ text, hint }) {
  const input = `You convert show-jumping results into JSON for a results database.
Return ONLY a JSON array, no prose. Each element uses these keys (omit unknowns):
class_name (string, required), class_type (Grand Prix|Premier|Open|Standard|Young Horse|Amateur|Pony),
class_date (YYYY-MM-DD), rider_name (required), horse_name (required),
placing (integer 1..N, null when unplaced), faults (round-1 jump faults number, 0 when clear),
time (round-1 time seconds or null), time_faults (number, default 0), height_cm (integer or null),
format (Jump-off when the class has a jump-off, else null),
status: finished normally; E eliminated, R retired, W withdrawn (also when placing shows E/R/W/DQ/EL/RET/WD/NS),
notes (anything else, e.g. prize), series_key (only when the class name clearly names a series,
e.g. Pro Am -> pro-am-series, Young Rider -> young-rider-series, Junior Rider -> junior-rider-series,
Amateur -> amateur-rider-series, Grand Prix -> grand-prix-series, Young Horse/5YO/6YO/7YO -> young-horse-series;
else null), start_order (start/draw number when shown, else null).
${hint || ''}
Results text (may be truncated):
${text.slice(0, 12000)}`;
  const rows = await aiJsonArray({ input });
  if (!Array.isArray(rows)) throw new Error('AI did not return a JSON array');
  const kept = [], dropped = [];
  for (const r of rows) {
    const c = cleanRecord(r);
    if (c) kept.push(c);
    else dropped.push(1);
  }
  return { records: kept, dropped: dropped.length };
}

module.exports = { aiMapRecords, aiChat, cleanRecord, aiAvailable: () => !!KEY };
