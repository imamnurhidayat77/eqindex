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
    body: JSON.stringify({ model: MODEL, input, reasoning: { effort: 'low' }, max_output_tokens: maxTokens }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}) ${t.slice(0, 120)}`);
  }
  let text = extractText(await res.json());
  // Tolerate chatty models: strip code fences, then locate the JSON payload.
  text = String(text || '').replace(/```(?:json)?/gi, '```').replace(/```/g, '');
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  const fail = (msg) => {
    const err = new Error(msg);
    err.prose = text.slice(0, 1500);
    throw err;
  };
  if (a >= 0 && b > a) {
    try {
      const parsed = JSON.parse(text.slice(a, b + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to object handling */ }
  }
  // Some models wrap the array in an object ({records:[...]} / {rows:[...]}).
  const oa = text.indexOf('{'), ob = text.lastIndexOf('}');
  if (oa >= 0 && ob > oa) {
    try {
      const obj = JSON.parse(text.slice(oa, ob + 1));
      for (const k of ['records', 'rows', 'data', 'results']) {
        if (Array.isArray(obj?.[k])) return obj[k];
      }
      const arr = Object.values(obj || {}).find((v) => Array.isArray(v));
      if (arr) return arr;
    } catch { /* fall through to fail */ }
  }
  if (a < 0 || b <= a) fail('AI did not return a JSON array');
  fail('AI returned malformed JSON');
}

async function aiResponses({ input, tools, maxTokens = 3000, session, model }) {
  if (!KEY) throw new Error('AI not configured — set OPENCODE_GO_API_KEY on the API service');
  const body = {
    model: model || MODEL,
    input,
    reasoning: { effort: 'low' },
    max_output_tokens: maxTokens,
  };
  if (tools?.length) body.tools = tools;
  const res = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: {
      'User-Agent': 'eqindex-import/1.0',
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'x-opencode-session': session || `chat-${Date.now().toString(36)}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}) ${t.slice(0, 120)}`);
  }
  const j = await res.json();
  const calls = [];
  for (const item of j.output || []) {
    if (item.type === 'function_call' && item.name) {
      calls.push({ name: item.name, args: item.arguments || '{}' });
    }
  }
  return { text: extractText(j).trim(), calls };
}

async function aiChat({ system, messages, maxTokens = 3000, session }) {
  const input = `${system}\n\n${messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')}\n\nAssistant:`;
  const { text } = await aiResponses({ input: input.slice(0, 15000), maxTokens, session });
  if (!text) throw new Error('AI returned an empty reply — try again');
  return text;
}

// Tool-using agent loop for the Import Assistant (Phase 1: read-only
// tools + lookups; nothing here writes). Transcript-based: each round the
// model either answers or emits function calls, whose results are pasted
// back as text. Bounded by maxIter so interactive chats stay fast.
async function aiAgent({ system, messages, tools, runTool, toolCtx, maxIter = 2, maxTokens = 3000, session, model }) {
  let transcript = `${system}\n\n${messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')}`;
  const toolUses = [];
  const cache = new Map(); // same tool+args twice → serve cached, don't re-run
  for (let i = 0; i <= maxIter; i++) {
    const last = i === maxIter;
    const { text, calls } = await aiResponses({
      input: (transcript + '\n\nAssistant:').slice(-15000),
      tools: last ? undefined : tools,
      maxTokens, session: `${session || `agent-${Date.now().toString(36)}`}-r${i}`,
      model,
    });
    const valid = (calls || []).slice(0, 3);
    if (!valid.length) {
      if (!text) throw new Error('AI returned an empty reply — try again');
      return { reply: text, toolUses };
    }
    for (const c of valid) {
      let args = {};
      try { args = JSON.parse(c.args || '{}'); } catch { args = {}; }
      const key = `${c.name} ${JSON.stringify(args)}`;
      let result, cached = false;
      if (cache.has(key)) {
        result = cache.get(key);
        cached = true;
      } else {
        result = await runTool(c.name, args, toolCtx);
        cache.set(key, result);
      }
      toolUses.push({ name: c.name, ok: !result?.error, cached });
      transcript += `\n[tool call: ${c.name} ${JSON.stringify(args).slice(0, 300)}]\n[tool result: ${JSON.stringify(result).slice(0, 2000)}]`;
    }
    transcript += '\nContinue. Answer concisely once you have what you need.';
  }
  const { text } = await aiResponses({ input: (transcript + '\n\nAssistant:').slice(-15000), maxTokens, session, model });
  if (!text) throw new Error('AI returned an empty reply — try again');
  return { reply: text, toolUses };
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
// Long texts (multi-page PDFs) are split into line-aligned chunks and
// mapped in parallel, then merged — previously only the first 10000 chars
// were sent, so a 59-page EvoEvents PDF lost ~80% of its classes.
const MAP_CHUNK = 9000;
const MAP_MAX_CHUNKS = 8;

function splitChunks(text, size) {
  const chunks = [];
  let start = 0;
  while (start < text.length && chunks.length < MAP_MAX_CHUNKS) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > start + size * 0.5) end = nl + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return { chunks, truncated: start < text.length };
}

const MAP_GUIDE = `Layout notes (EvoEvents PDFs especially):
- Ignore PRELIMINARY TIMETABLE pages and lines like "X out of Y Finished".
- Each class section has a title line such as "2 Groom & Gallop Open Horse 1.10m Art 238 2.1"
  (sometimes BEFORE its rows, sometimes AFTER them — it applies to every row until the next title).
  Use the nearest title as class_name, including its number prefix when present.
- Result rows look like "25 Gerberoy De St Aubert  Ben Weir  1  60.23  0  0  0"
  (backNo, horse, rider, placing, time, penalties...). A rider name split across two lines
  still belongs to the same row — join it.
- Placing may be E/EL (eliminated), R/RET (retired), W/WD/NS (withdrawn), DQ: set status
  accordingly (E/R/W/DQ) and placing null. Placing 0 also means unplaced (null).`;

function buildInput(chunk, i, n, chunks, hint) {
  const ctx = i > 0 ? `Previous chunk tail for class-title context:\n${chunks[i - 1].slice(-500)}\n\n` : '';
  return `You convert show-jumping results into JSON for a results database.
OUTPUT CONTRACT (must hold): your entire response is exactly one JSON array and nothing else — no intro, no explanation, no code fences. If you cannot find complete rows, output exactly [].
Each element uses these keys (omit unknowns):
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
${MAP_GUIDE}
${n > 1 ? `This is part ${i + 1} of ${n} — map every complete row in THIS part only.\n` : ''}${ctx}Results text (this part):
${chunk.slice(0, MAP_CHUNK + 600)}
REMINDER: output exactly one JSON array, nothing else. [] when no complete rows.`;
}

async function aiMapRecords({ text, hint, session, onChunk }) {
  const src = String(text || '');
  const { chunks, truncated } = splitChunks(src, MAP_CHUNK);
  const sid = session || `import-${Date.now().toString(36)}`;
  const mapOne = (chunk, i, part) =>
    aiJsonArray({ input: buildInput(chunk, i, chunks.length, chunks, hint), maxTokens: 8000, session: `${sid}-p${part}` });
  const runChunk = async (chunk, i) => {
    try {
      const rows = await mapOne(chunk, i, i);
      onChunk?.({ index: i, rows: rows.length, retried: false });
      return rows;
    } catch (e) {
      // Truncated model output parses as malformed JSON but still carries
      // prose — retry as two halves so no class section is silently lost.
      const canSplit = e.prose !== undefined && chunk.length > 2000;
      if (!canSplit) {
        if (e.prose !== undefined) {
          const err = new Error('chunk-empty');
          err.prose = e.prose;
          onChunk?.({ index: i, rows: 0, retried: false, empty: true });
          throw err;
        }
        onChunk?.({ index: i, rows: 0, retried: false, failed: e.message });
        throw e;
      }
      const mid = chunk.lastIndexOf('\n', Math.floor(chunk.length / 2));
      const halves = mid > 0 ? [chunk.slice(0, mid + 1), chunk.slice(mid + 1)] : [chunk];
      const out = [];
      for (let h = 0; h < halves.length; h++) {
        try {
          out.push(...(await mapOne(halves[h], i, `${i}${String.fromCharCode(97 + h)}`)));
        } catch (e2) {
          if (e2.prose === undefined) throw e2;
        }
      }
      onChunk?.({ index: i, rows: out.length, retried: true });
      return out;
    }
  };
  const settled = await Promise.all(chunks.map((c, i) => runChunk(c, i).then(
    (rows) => ({ ok: true, rows }),
    (e) => ({ ok: false, error: e }),
  )));
  const hardFail = settled.find((s) => !s.ok && s.error?.message !== 'chunk-empty');
  if (hardFail) throw hardFail.error;
  let prose = '';
  for (const s of settled) {
    if (!s.ok && s.error?.prose && !prose) prose = s.error.prose;
  }
  let rows = settled.flatMap((s) => (s.ok ? s.rows : []));
  if (!Array.isArray(rows)) {
    const err = new Error('AI did not return a JSON array');
    err.prose = prose || '';
    throw err;
  }
  const kept = [], dropped = [];
  const seen = new Set();
  for (const r of rows) {
    const c = cleanRecord(r);
    if (c) {
      const k = `${c.class_name}|${c.rider_name}|${c.horse_name}|${c.placing ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      kept.push(c);
    } else dropped.push(1);
  }
  return { records: kept, dropped: dropped.length, prose, truncated };
}

module.exports = { aiMapRecords, aiChat, aiAgent, aiResponses, cleanRecord, aiAvailable: () => !!KEY };
