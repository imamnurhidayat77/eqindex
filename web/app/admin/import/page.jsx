'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY, BTN_DANGER, badge, BADGE } from '../../../lib/tokens';

const SPEC = 'class_name, class_type, class_date, rider_name, horse_name, placing, faults, time, time_faults, height_cm, status, notes';

export default function AdminImport() {
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [csv, setCsv] = useState('');
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

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => setCsv(String(rd.result || ''));
    rd.readAsText(f);
  }
  async function run(dry) {
    setErr('');
    if (!eventId) { setErr('Select a target event first.'); return; }
    if (!csv.trim()) { setErr('Paste CSV or choose a file first.'); return; }
    setBusy(true);
    try {
      const d = await api('/admin/import', { event_id: eventId, csv, dry_run: dry });
      setPreview(d);
      if (!dry) { setCsv(''); loadHistory(); }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>Weekly CSV import</h1>
      <p className={SUB}>Paste or upload organiser results → validate → preview points → commit. Duplicates auto-rejected.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      <section className={CARD}>
        <div className="flex flex-wrap gap-2.5 items-end mb-3">
          <label className="text-xs text-muted flex flex-col gap-1">Target event
            <select className={INP} value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">— select —</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name} · {(e.date_start || '').slice(0, 10)}</option>)}
            </select></label>
          <label className="text-xs text-muted flex flex-col gap-1">…or CSV file
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-[13px] text-muted" /></label>
        </div>
        <p className="text-[12px] text-faint mb-1.5">Columns: <code>{SPEC}</code> (placing/faults/time accept placing|finish_place, faults|jump_faults, time|time_seconds aliases)</p>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} spellCheck={false}
          placeholder="class_name,class_type,class_date,rider_name,horse_name,placing,faults,time,time_faults&#10;Grand Prix,Grand Prix,2026-03-01,Sophie Bennett,Kiwi Spirit,1,0,65.2,0"
          className="w-full rounded border border-line bg-ink text-body text-[13px] font-mono p-3 focus:border-gold/60 focus:outline-none" />
        <div className="flex gap-2 mt-3">
          <button className={BTN_PRIMARY} disabled={busy} onClick={() => run(true)}>{busy ? 'Working…' : 'Validate & preview →'}</button>
          <button className={BTN_DANGER} disabled={busy || !preview || preview.dry_run === false} onClick={() => run(false)}>Commit import</button>
        </div>
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
