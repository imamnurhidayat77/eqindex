'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';
import Dropdown from '../../../components/Dropdown';

const SPEC = 'class_name, class_type, class_date, rider_name, horse_name, placing, faults, time, time_faults, height_cm, format, status, notes, series_key';

const FIELD_DOCS = [
  ['class_name*', 'Class as listed, e.g. 1.30m Championship'],
  ['class_type', 'Grand Prix | Premier | Open | Standard | Young Horse | Amateur | Pony (default Standard)'],
  ['format', 'Two-phase | Jump-off | Speed | Power & Speed (optional)'],
  ['class_date', 'YYYY-MM-DD'],
  ['rider_name* / horse_name*', 'Matched by normalised name; auto-created with confirmation flag'],
  ['placing', 'Positive integer; empty = unplaced, 0 pts'],
  ['faults / time / time_faults', 'Numeric; aliases jump_faults, time_seconds accepted'],
  ['height_cm', 'e.g. 130'],
  ['status', 'finished (default) | E | R | W | DQ'],
  ['notes', 'Free text, e.g. Withdrawn'],
  ['series_key', 'Links the class into a series engine race, e.g. demo-premier-2526'],
  ['series_key', 'Links the class into a series engine race, e.g. demo-premier-2526'],
];

const SAMPLE_CSV = `class_name,class_type,class_date,rider_name,horse_name,placing,faults,time,time_faults,height_cm,status
Grand Prix,Grand Prix,2026-03-01,Sophie Bennett,Kiwi Spirit,1,0,65.2,0,140,finished
Grand Prix,Grand Prix,2026-03-01,James Wilson,Ocean Star,2,4,67.0,0,140,finished`;

const SAMPLE_JSON = [
  { class_name: 'Grand Prix', class_type: 'Grand Prix', class_date: '2026-03-01', rider_name: 'Sophie Bennett', horse_name: 'Kiwi Spirit', placing: 1, faults: 0, time: 65.2, time_faults: 0, height_cm: 140, status: 'finished' },
  { class_name: 'Grand Prix', class_type: 'Grand Prix', class_date: '2026-03-01', rider_name: 'James Wilson', horse_name: 'Ocean Star', placing: 2, faults: 4, time: 67.0, time_faults: 0, height_cm: 140, status: 'finished' },
];

export default function AdminImport() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [csv, setCsv] = useState('');
  const [mode, setMode] = useState('csv');
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function api(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
    return j.data;
  }
  async function loadHistory() {
    try {
      const res = await fetch(`${API}/admin/imports`, { credentials: 'include' });
      if (res.ok) setHistory((await res.json()).data || []);
    } catch { /* shell */ }
  }
  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
    loadHistory();
  }, []);

  function download(kind) {
    const blob = kind === 'csv'
      ? new Blob([SAMPLE_CSV], { type: 'text/csv' })
      : new Blob([JSON.stringify(SAMPLE_JSON, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = kind === 'csv' ? 'eqindex-template.csv' : 'eqindex-template.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.name.endsWith('.json')) setMode('json');
    const rd = new FileReader();
    rd.onload = () => setCsv(String(rd.result || ''));
    rd.readAsText(f);
  }
  async function run(dry) {
    setErr('');
    if (!eventId) { setErr('Select a target event first.'); return; }
    if (!csv.trim()) { setErr('Paste data or choose a file first.'); return; }
    setBusy(true);
    try {
      let body = { event_id: eventId, dry_run: dry };
      if (mode === 'json') {
        try { body.records = JSON.parse(csv); }
        catch { throw new Error('Invalid JSON — must be an array of records.'); }
        if (!Array.isArray(body.records)) throw new Error('JSON must be an array of records.');
      } else {
        body.csv = csv;
      }
      const d = await api('/admin/import', body);
      setPreview(d);
      if (!dry) { setCsv(''); loadHistory(); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>Results import</h1>
      <p className={SUB}>CSV or JSON organiser results → validate → preview points → commit. Duplicates auto-rejected.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <section className={CARD}>
        <div className="flex gap-1 rounded bg-card2 p-1 text-[12.5px] w-fit mb-3">
          {[['csv', 'CSV'], ['json', 'JSON']].map(([v, l]) => (
            <button key={v} onClick={() => { setMode(v); setPreview(null); }}
              className={`rounded-md px-4 py-1.5 font-semibold ${mode === v ? 'bg-[#2a3342] text-gold' : 'text-muted hover:text-white'}`}>{l}</button>
          ))}
          <span className="flex-1" />
        </div>
        <div className="flex flex-wrap gap-2.5 items-end mb-3">
          <label className="text-xs text-muted flex flex-col gap-1">Target event
            <Dropdown ariaLabel="Target event" value={eventId} searchable placeholder="— select —"
              options={[{ value: '', label: '— select —' },
                ...events.map((e) => ({ value: e.id, label: `${e.name} · ${(e.date_start || '').slice(0, 10)}` }))]}
              onSelect={(o) => setEventId(o.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">…or {mode.toUpperCase()} file
            <input type="file" accept={mode === 'csv' ? '.csv,text/csv' : '.json,application/json'} onChange={onFile} className="text-[13px] text-muted" /></label>
          <span className="flex gap-2 ml-auto">
            <button className="text-[12px] text-sky hover:underline bg-none border-0 cursor-pointer" onClick={() => download('csv')}>⤓ CSV template</button>
            <button className="text-[12px] text-sky hover:underline bg-none border-0 cursor-pointer" onClick={() => download('json')}>⤓ JSON template</button>
          </span>
        </div>
        <p className="text-[12px] text-faint mb-1.5">Columns: <code>{SPEC}</code> (aliases accepted, see format guide below)</p>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} spellCheck={false}
          placeholder={mode === 'csv'
            ? 'class_name,class_type,class_date,rider_name,horse_name,placing,faults,time,time_faults\nGrand Prix,Grand Prix,2026-03-01,Sophie Bennett,Kiwi Spirit,1,0,65.2,0'
            : '[{"class_name":"Grand Prix","rider_name":"Sophie Bennett","horse_name":"Kiwi Spirit","placing":1,...}]'}
          className="w-full rounded border border-line bg-ink text-body text-[13px] font-mono p-3 focus:border-gold/60 focus:outline-none" />
        <div className="flex gap-2 mt-3">
          <button className={BTN_PRIMARY} disabled={busy} onClick={() => run(true)}>{busy ? 'Working…' : 'Validate & preview →'}</button>
          <button className={BTN_DANGER} disabled={busy || !preview || preview.dry_run === false} onClick={() => run(false)}>Commit import</button>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-[15px] font-bold mb-2">Canonical format reference <span className="text-[11px] text-faint font-semibold">· the benchmark every organiser file is mapped to</span></h2>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Field (* required)</th><th className={TH}>Rules</th></tr></thead>
          <tbody>
            {FIELD_DOCS.map(([f, d]) => (
              <tr key={f}><td className={TD}><code>{f}</code></td><td className={`${TD} text-muted`}>{d}</td></tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="text-[12px] text-faint mt-2">Identity: rider/horse matched on normalised name (accents stripped, uppercased); new names auto-created and flagged. Points computed by the database trigger — never by the uploader.</p>
      </section>

      {preview && (
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-1">
            {preview.dry_run ? 'Preview (nothing saved)' : 'Import result'}
            <span className="ml-2 text-[12px] text-muted font-semibold">{preview.summary.ok} ok · {preview.summary.failed} failed · {preview.summary.total} rows</span>
          </h2>
          <div className={TABLEWRAP}>
          <table className={TABLE}>
            <thead><tr><th className={TH}>Line</th><th className={TH}>Rider</th><th className={TH}>Horse</th><th className={TH}>Class</th><th className={`${TH} ${NUM}`}>Place</th><th className={`${TH} ${NUM}`}>Points</th><th className={TH}>Flags</th></tr></thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={i}>
                  <td className={`${TD} text-muted`}>{r.line}</td>
                  <td className={TD}>{r.preview?.rider || '–'}</td>
                  <td className={TD}>{r.preview?.horse || '–'}</td>
                  <td className={TD}>{r.preview?.class || '–'}</td>
                  <td className={`${TD} ${NUM}`}>{r.preview?.place ?? '–'}</td>
                  <td className={`${TD} ${NUM}`}><b className={r.ok ? 'text-gold' : 'text-faint'}>{r.ok ? r.preview.points : '–'}</b></td>
                  <td className={TD}>
                    {r.ok
                      ? <>{r.preview.new_horse && <span className={badge(BADGE.blue)}>new horse</span>}{' '}
                           {r.preview.new_rider && <span className={badge(BADGE.blue)}>new rider</span>}{' '}
                           {r.preview.new_class && <span className={badge(BADGE.gray)}>new class</span>}</>
                      : <span className={badge(BADGE.red)}>{r.errors.join('; ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}

      {!!history.length && (
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2">Import history</h2>
          <div className={TABLEWRAP}>
          <table className={TABLE}>
            <thead><tr><th className={TH}>When</th><th className={TH}>Actor</th><th className={TH}>Event</th><th className={`${TH} ${NUM}`}>OK</th><th className={`${TH} ${NUM}`}>Failed</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className={`${TD} text-muted`}>{(h.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td className={TD}>{h.actor}</td>
                  <td className={TD}>{h.event_name || '–'}</td>
                  <td className={`${TD} ${NUM} text-moss`}>{h.rows_ok}</td>
                  <td className={`${TD} ${NUM} ${h.rows_failed ? 'text-blood' : 'text-muted'}`}>{h.rows_failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
      {!preview && <section className={CARD}><p className={EMPTY}>No preview yet — paste CSV and validate.</p></section>}
    </>
  );
}
