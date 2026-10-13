// Equipe meeting fetcher (Node mirror of ingest/providers/equipe.py).
// Public JSON API, no auth. Keeps the SAME conventions (upper-bound
// heights, series guess, start_order, elim handling) so JS and Python
// imports produce identical canonical records.
const BASE = 'https://online.equipe.com';
const UA = { 'User-Agent': 'eqindex-import/1.0' };

async function eqGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: UA });
  if (!res.ok) throw new Error(`Equipe fetch failed (${res.status}) ${path}`);
  return res.json();
}

function parseHeight(raw) {
  if (raw === null || raw === undefined) return null;
  const vals = String(raw).match(/\d+(?:\.\d+)?/g);
  if (!vals) return null;
  return Math.round(Math.max(...vals.map(Number)) * 100);
}

function rangeUpper(name) {
  let best = null;
  const re = /(\d+(?:\.\d+)?)\s*[-/]\s*(\d+(?:\.\d+)?)\s*(cm|m)\b/gi;
  let m;
  while ((m = re.exec(name || ''))) {
    const v = Math.round(Number(m[2]) * (m[3].toLowerCase() === 'm' ? 100 : 1));
    if (best === null || v > best) best = v;
  }
  return best;
}

function classify(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('grand prix')) return ['Grand Prix', n.includes('pony') ? 'pony-grand-prix-series' : 'grand-prix-series'];
  if (n.includes('mini prix')) return ['Premier', null];
  if (n.includes('young horse') || n.includes(' year old ')) return ['Young Horse', 'young-horse-series'];
  if (n.includes('young rider')) return ['Open', 'young-rider-series'];
  if (n.includes('junior rider')) return ['Open', 'junior-rider-series'];
  if (n.includes('amateur rider') || n.includes('amateur')) return ['Amateur', 'amateur-rider-series'];
  if (/\bpro[ -]?am\b/.test(n)) return ['Open', 'pro-am-series'];
  if (n.startsWith('open pony') || n.includes(' open pony ')) return ['Open', null];
  if (n.startsWith('open horse') || n.includes(' open horse ')) return ['Open', null];
  if (n.startsWith('intro')) return ['Standard', null];
  return ['Standard', null];
}

function cleanNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const f = Number(v);
  if (!Number.isFinite(f) || f >= 999) return null;
  return f;
}

function statusOf(start, p1) {
  const rs = String(p1.status || '').trim().toLowerCase();
  if (rs === 'eliminated') return 'E';
  if (rs === 'retired') return 'R';
  if (rs === 'withdrawn') return 'W';
  const prev = String(start.result_preview || '').trim().toUpperCase();
  if (['E', 'EL', 'ELIM', 'ELIMINATED'].includes(prev)) return 'E';
  if (['R', 'RET', 'RETIRED'].includes(prev)) return 'R';
  if (['WD', 'NS', 'DNS', 'W', 'WITHDRAWN'].includes(prev)) return 'W';
  return 'finished';
}

async function equipeRecords(meetingId, { seriesMap = {}, skipPractice = true } = {}) {
  const sched = await eqGet(`/api/v1/meetings/${meetingId}/schedule`);
  const meeting = sched.display_name || sched.name || `Equipe ${meetingId}`;
  const classes = (sched.meeting_classes || []).filter((c) => c.discipline === 'show_jumping');
  const records = [], skipped = [];
  // Small concurrency: fast but polite.
  const queue = [...classes];
  async function worker() {
    while (queue.length) {
      const cls = queue.shift();
      const name = (cls.name || '').trim();
      const cno = String(cls.class_no || '');
      if (skipPractice && name.toLowerCase().includes('practice')) {
        skipped.push([cno, name, 'practice skipped']);
        continue;
      }
      let [ctype, series] = classify(name);
      if (cno && seriesMap[cno]) series = seriesMap[cno];
      let height = parseHeight(cls.fence_height);
      const nameHigh = rangeUpper(name);
      if (nameHigh && (height === null || nameHigh > height)) height = nameHigh;
      const jo = /\bIJO\b|\bAM5\b|\b261\./i.test(name);
      for (const sec of cls.class_sections || []) {
        if (!['results', 'finished', 'final'].includes(sec.state)) continue;
        let detail;
        try {
          detail = await eqGet(`/api/v1/class_sections/${sec.id}`);
        } catch (e) {
          skipped.push([cno, name, `section fetch: ${e.message}`]);
          continue;
        }
        for (const s of detail.starts || []) {
          const rider = (s.rider_name || '').trim();
          const horse = (s.horse_name || '').trim();
          if (!rider || !horse) { skipped.push([cno, name, 'missing rider/horse']); continue; }
          if (s.ridden === false) { skipped.push([cno, name, `DNS ${rider}/${horse}`]); continue; }
          const ph = {};
          for (const r of s.results || []) {
            if (r && r.phase !== undefined && r.phase !== null) ph[Number(r.phase)] = r;
          }
          const p1 = ph[1] || {}, p2 = ph[2] || {};
          const status = statusOf(s, p1);
          let so = null;
          const sn = parseInt(String(s.start_no || '').trim(), 10);
          // Equipe uses negative numbers for late/scratch entries —
          // not a real start order, so leave it NULL (rule not applied).
          if (Number.isInteger(sn) && sn >= 1) so = sn;
          if (status !== 'finished') {
            records.push({
              class_name: name, class_no: cno || undefined, class_type: ctype,
              class_date: cls.date || undefined, rider_name: rider, horse_name: horse,
              placing: undefined, faults: 0, time_faults: 0, height_cm: height ?? undefined,
              status, series_key: series || undefined, start_order: so ?? undefined,
            });
            continue;
          }
          const rec = {
            class_name: name, class_no: cno || undefined, class_type: ctype,
            class_date: cls.date || undefined, rider_name: rider, horse_name: horse,
            placing: s.rank ?? undefined, faults: cleanNum(p1.fence_faults) ?? 0,
            time: cleanNum(p1.time), time_faults: cleanNum(p1.time_faults) ?? 0,
            height_cm: height ?? undefined, status, series_key: series || undefined,
            start_order: so ?? undefined, prize: s.prize ?? undefined,
          };
          if (p2.fence_faults !== undefined || p2.time !== undefined) {
            if (jo) {
              rec.jumpoff_faults = cleanNum(p2.fence_faults) ?? 0;
              if (cleanNum(p2.time) !== null) rec.jumpoff_time = cleanNum(p2.time);
            } else {
              rec.round2_faults = cleanNum(p2.fence_faults) ?? 0;
              if (cleanNum(p2.time) !== null) rec.round2_time = cleanNum(p2.time);
            }
          }
          if (name.toLowerCase().includes('practice')) rec.notes = 'practice round';
          records.push(Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== undefined)));
        }
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { meeting, records, skipped };
}

module.exports = { equipeRecords, classify };
