// EvoEvents results fetcher (Node mirror of ingest/scrapers/evoevents_site.py).
// Given an event results URL/ID (evoevents.co.nz/results/<id>), walks every
// class page's results-scorecard table (Back No | Horse | Rider | Place …
// in ONE row — no PDF line-splitting ambiguity) and returns canonical
// import records ready for the dry-run → Commit flow.
// Polite by design: browser UA, 1s between class fetches, capped classes.
const BASE = 'https://www.evoevents.co.nz';
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' };
const SLEEP_MS = 1000;
const MAX_CLASSES = 80;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const res = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!res.ok) throw new Error(`EvoEvents fetch failed (${res.status})`);
    return await res.text();
  } finally { clearTimeout(t); }
}

function parseHeight(name) {
  const re = /(\d+(?:\.\d+)?)\s*(?:[−/-]\s*(\d+(?:\.\d+)?))?\s*(cm|m)\b/gi;
  const vals = [];
  let m;
  while ((m = re.exec(name || ''))) {
    const f = m[3].toLowerCase() === 'm' ? 100 : 1;
    vals.push(Number(m[2] || m[1]) * f);
  }
  return vals.length ? Math.round(Math.max(...vals)) : null;
}

function classify(name) {
  const n = (name || '').toLowerCase();
  let ctype = 'Standard';
  if (n.includes('grand prix')) ctype = 'Grand Prix';
  else if (n.includes('mini prix')) ctype = 'Premier';
  else if (n.includes('young horse')) ctype = 'Young Horse';
  else if (n.includes('amateur')) ctype = 'Amateur';
  else if (n.includes('open')) ctype = 'Open';
  const fmt = (n.includes('am5') || n.includes('ijo')) ? 'Jump-off' : null;
  return [ctype, fmt];
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
}

// Class hrefs on the event landing page: /results/<eid>/class/<cid>.
function classHrefs(eid, html) {
  const out = [];
  const re = /href="(\/results\/(\d+)\/class\/(\d+))"/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[2] === String(eid) && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// Minimal table parser for table.results-scorecard → {header, rows}.
function scorecard(html) {
  const tm = html.match(/<table[^>]*class="[^"]*results-scorecard[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tm) return { header: null, rows: [] };
  const rows = [];
  for (const rm of tm[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(decodeEntities(stripTags(cm[1])));
    }
    if (cells.length) rows.push(cells);
  }
  let header = null;
  const data = [];
  for (const r of rows) {
    if (!header && r.some((c) => /back no/i.test(c))) { header = r; continue; }
    if (header) data.push(r);
  }
  return { header, rows: data };
}

function num(tok) {
  const t = String(tok == null ? '' : tok).trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function eventDates(html) {
  const found = [];
  for (const m of String(html).matchAll(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d\d)/gi)) {
    found.push(`${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`);
  }
  if (!found.length) return { date_start: null, date_end: null };
  found.sort();
  return { date_start: found[0], date_end: found[found.length - 1] };
}

async function evoeventsRecords(eventId, { seriesMap = {}, dateStart = null, dateEnd = null, eventName = null, venue = null, region = null } = {}) {
  const eid = String(eventId).match(/\d+/);
  if (!eid) throw new Error('need a numeric EvoEvents event ID');
  const id = eid[0];
  const first = await fetchText(`${BASE}/results/${id}`);
  const hrefs = classHrefs(id, first).slice(0, MAX_CLASSES);
  if (!hrefs.length) throw new Error('no class pages found on that event');
  let tm = first.match(/<title>(.*?)<\/title>/is);
  const titleCore = tm ? decodeEntities(stripTags(tm[1])).split('—')[0].trim() : `EvoEvents ${id}`;
  const meeting = eventName || titleCore;
  const auto = eventDates(first);
  const ds = dateStart || auto.date_start, de = dateEnd || auto.date_end || ds;

  const recs = [], skipped = [];
  for (const href of hrefs) {
    await sleep(SLEEP_MS);
    let html;
    try { html = await fetchText(`${BASE}${href}`); }
    catch (e) { skipped.push([href, '', `fetch failed (${e.message})`]); continue; }
    let cno = '', cname = '';
    const t2 = html.match(/<title>(.*?)<\/title>/is);
    if (t2) {
      const core = decodeEntities(stripTags(t2[1])).split('—')[0].trim();
      const m = core.match(/^(\d+)\s+(.*)/);
      if (m) { cno = m[1]; cname = m[2].trim(); } else cname = core;
    }
    if (/rider alphabetical/i.test(cname)) continue; // entry list, no placings
    const sc = scorecard(html);
    if (!sc.header || !sc.rows.length) continue; // timetable/empty class
    const H = sc.header.map((h) => h.toLowerCase());
    const col = (...names) => {
      for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; }
      return -1;
    };
    const cHorse = col('horse'), cRider = col('rider');
    if (cHorse < 0 || cRider < 0) { skipped.push([cno, cname, 'table lacks horse/rider columns']); continue; }
    const cPlace = col('place'), cTime = col('sj time'), cTpen = col('sj time pen'), cJpen = col('sj jump pen');
    const cJot = col('jo time'), cJotpen = col('jo time pen');
    const [ctype, fmt] = classify(cname);
    const height = parseHeight(cname);
    const skey = seriesMap[cno];
    const cnameFull = cno ? `${cno} ${cname}` : cname;
    let nRows = 0;
    const classRecs = [];
    for (const r of sc.rows) {
      const get = (i) => (i >= 0 && i < r.length ? r[i] : '');
      const horse = get(cHorse), rider = get(cRider);
      if (!horse || !rider) continue;
      const eliminated = r.some((c) => String(c || '').trim() === 'E');
      const retired = r.some((c) => String(c || '').trim() === 'R');
      const place = num(get(cPlace));
      if (place === null && !eliminated && !retired) {
        skipped.push([cno, `practice/schooling row '${rider}'`]); continue;
      }
      const status = eliminated ? 'eliminated' : retired ? 'retired' : 'finished';
      const finished = status === 'finished';
      const rec = {
        class_name: cnameFull, class_type: ctype,
        rider_name: rider, horse_name: horse,
        placing: finished && place !== null ? Math.trunc(place) : null,
        faults: finished ? num(get(cJpen)) : null,
        time_faults: finished ? num(get(cTpen)) : null,
        time: finished ? num(get(cTime)) : null,
        status: finished ? null : status,
        height_cm: height, format: fmt,
        event_name: meeting, date_start: ds, date_end: de,
      };
      if (venue) rec.venue = venue;
      if (region) rec.region = region;
      if (skey) rec.series_key = skey;
      if (finished && get(cJotpen) !== '') {
        rec.jumpoff_time = num(get(cJot));
        rec.jumpoff_faults = num(get(cJotpen));
      }
      Object.keys(rec).forEach((k) => { if (rec[k] === null || rec[k] === undefined) delete rec[k]; });
      classRecs.push(rec);
      nRows += 1;
    }
    for (const rec of classRecs) rec.field_size = nRows;
    recs.push(...classRecs);
  }
  return {
    meeting, event: { name: meeting, date_start: ds, date_end: de, ...(venue ? { venue } : {}), ...(region ? { region } : {}) },
    records: recs, skipped: skipped.map(([a, b, c]) => [a, b, c].filter(Boolean).join(' ').slice(0, 160)),
  };
}

module.exports = { evoeventsRecords };
