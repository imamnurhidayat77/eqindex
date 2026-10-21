'use client';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, BTN_PRIMARY } from '../../../lib/tokens';
import { useAdminApi } from '../../../components/useAdminApi';
import { TableRowsSk } from '../../../components/Skeletons';

// Series Review — close the Sophia gap from both ends:
// 1. Untagged: classes without series_key (tag them or judge non-series;
//    tagging recalculates points automatically via triggers).
// 2. Heights: per-series standard heights for "as per series conditions"
//    classes + one-click apply to height-less classes.
// 3. Official check: diff our board against an official ESNZ board
//    (EvoEvents resultClass URL or pasted table) to catch mistags.
const TABS = [['untagged', 'Untagged classes'], ['heights', 'Height specs'], ['official', 'Official check']];

export default function AdminSeriesReview() {
  const call = useAdminApi();
  const [tab, setTab] = useState('untagged');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [seriesList, setSeriesList] = useState([]);
  const [picks, setPicks] = useState({});
  const [specs, setSpecs] = useState([]);
  const [specForm, setSpecForm] = useState({ series_key: '', default_height_cm: '', source: '' });
  const [checkSeries, setCheckSeries] = useState('');
  const [checkUrl, setCheckUrl] = useState('');
  const [checkText, setCheckText] = useState('');
  const [diff, setDiff] = useState(null);
  const [initial, setInitial] = useState(true);

  async function load() {
    try {
      // useAdminApi returns response bodies' `data`.
      const [u, h] = await Promise.all([
        call('/admin/series/untagged?limit=200'),
        call('/admin/series/heights'),
      ]);
      setRows(Array.isArray(u) ? u : []);
      setSpecs(Array.isArray(h) ? h : []);
    } catch (e) { setMsg(e.message); }
    setInitial(false);
  }
  useEffect(() => {
    load();
    fetch(`${API}/series`).then((r) => r.json()).then((j) => setSeriesList(j.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verdict(row, seriesKey) {
    setBusy(true); setMsg('');
    try {
      const d = await call('/admin/series/verdicts', {
        method: 'POST',
        body: JSON.stringify({ items: [{ class_id: row.class_id, name: row.name, series_key: seriesKey }] }),
      });
      setMsg(seriesKey === 'non_series'
        ? `Marked non-series — won't ask again.`
        : `Tagged ${d.tagged} class(es) as ${seriesKey} — points recalculated.`);
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  async function saveSpec() {
    if (!specForm.series_key || !specForm.default_height_cm) { setMsg('Pick a series and a height first.'); return; }
    setBusy(true);
    try {
      await call('/admin/series/heights', { method: 'POST', body: JSON.stringify(specForm) });
      setMsg(`Saved height spec for ${specForm.series_key}.`);
      setSpecForm({ series_key: '', default_height_cm: '', source: '' });
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  async function applySpecs() {
    setBusy(true);
    try {
      const d = await call('/admin/series/heights/apply', { method: 'POST', body: JSON.stringify({}) });
      const parts = Object.entries(d.bySeries || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
      const left = Object.entries(d.noRule || {}).map(([k, v]) => `${k} (${v})`).join(', ');
      setMsg(`Filled ${d.classes} classe(s)${parts ? ` (${parts})` : ''}.${left ? ` Still no rule: ${left}.` : ''}`);
      load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  async function runCheck() {
    if (!checkSeries) { setMsg('Pick a series first.'); return; }
    if (!checkUrl.trim() && !checkText.trim()) { setMsg('Paste an official board URL or its text.'); return; }
    setBusy(true); setDiff(null);
    try {
      const d = await call('/admin/series/check', {
        method: 'POST',
        body: JSON.stringify({ series_key: checkSeries, official_url: checkUrl.trim() || undefined, official_text: checkText || undefined }),
      });
      setDiff(d);
      setMsg('');
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  const noHeight = rows.filter((r) => r.height_null);

  return (
    <>
      <h1 className={H1}>Series Review</h1>
      <p className={SUB}>Every class carries a series tag or a recorded non-series verdict — nothing scores 0 silently.</p>
      {msg && <section className={CARD} role="alert"><p className="text-sm text-gold">{msg}</p></section>}

      <div className="flex gap-1 bg-card2 border border-line rounded p-1 overflow-x-auto w-fit mb-4">
        {TABS.map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${tab === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
            {lbl}{k === 'untagged' && rows.length ? ` (${rows.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'untagged' && (
        <section className={CARD}>
          <h2 className="text-[14px] font-bold mb-1">Classes without a series tag</h2>
          <p className="text-[12.5px] text-muted mb-3">Tag to a series (points recalculate at once) or judge non-series (never asked again). <span className="text-gold">Series-like</span> names matched our patterns but no rule.</p>
          <div className={TABLEWRAP}>
          <table className={TABLE}>
            <thead><tr><th className={TH}>Class</th><th className={TH}>Event</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}>Signals</th><th className={TH}>Verdict</th></tr></thead>
            <tbody>
              {initial && <TableRowsSk rows={5} />}
              {rows.map((r) => (
                <tr key={r.class_id} className="border-b border-rowline last:border-0">
                  <td className={`${TD} max-w-[280px]`}><span className="block truncate" title={r.name}>{r.name}</span>
                    <span className="text-[11px] text-faint">{(r.class_date || '').slice(0, 10)}</span></td>
                  <td className={`${TD} text-muted text-[13px]`}>{r.event}</td>
                  <td className={`${TD} ${NUM}`}>{r.rounds}</td>
                  <td className={TD}>{r.series_like
                    ? <span className="text-[11px] font-bold text-gold">series-like</span>
                    : <span className="text-[11px] text-faint">generic</span>}</td>
                  <td className={TD}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select value={picks[r.class_id] || ''} onChange={(e) => setPicks({ ...picks, [r.class_id]: e.target.value })} className={INP} style={{ maxWidth: 190 }}>
                        <option value="">Pick series…</option>
                        {seriesList.map((s) => <option key={s.series_key} value={s.series_key}>{s.series_name || s.series_key}</option>)}
                      </select>
                      <button disabled={busy || !picks[r.class_id]} onClick={() => verdict(r, picks[r.class_id])} className={BTN_PRIMARY}>Tag</button>
                      <button disabled={busy} onClick={() => verdict(r, 'non_series')} className="text-faint text-[12px] hover:text-white bg-none border-0 cursor-pointer">Not series</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!initial && !rows.length && <tr><td colSpan={5} className="px-2 py-4 text-[13px] text-faint">Everything tagged or judged — clean.</td></tr>}
            </tbody>
          </table>
          </div>
        </section>
      )}

      {tab === 'heights' && (
        <>
          <section className={CARD}>
            <h2 className="text-[14px] font-bold mb-1">Per-series standard heights</h2>
            <p className="text-[12.5px] text-muted mb-3">Applied to classes with no height ("as per series conditions"). Rows below are manual overrides — without them, the official ESNZ bands apply automatically (Premier shows upper band, 5/6YO by calendar, 7YO by championship status, tertiary never).</p>
            <div className={TABLEWRAP}>
            <table className={TABLE}>
              <thead><tr><th className={TH}>Series</th><th className={`${TH} ${NUM}`}>Height (cm)</th><th className={TH}>Source</th><th className={TH}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {specs.map((s) => (
                  <tr key={s.series_key} className="border-b border-rowline last:border-0">
                    <td className={`${TD} font-mono text-[12px]`}>{s.series_key}</td>
                    <td className={`${TD} ${NUM}`}>{s.default_height_cm}</td>
                    <td className={`${TD} text-muted text-[12px]`}>{s.source || '—'}</td>
                    <td className={`${TD} text-right`}>
                      <button onClick={async () => { try { await call(`/admin/series/heights/${s.series_key}`, { method: 'DELETE' }); load(); } catch (e) { setMsg(e.message); } }}
                        className="text-faint text-[12px] hover:text-blood bg-none border-0 cursor-pointer">Delete</button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line">
                  <td className={TD}>
                    <select value={specForm.series_key} onChange={(e) => setSpecForm({ ...specForm, series_key: e.target.value })} className={INP} style={{ maxWidth: 220 }}>
                      <option value="">Pick series…</option>
                      {seriesList.map((s) => <option key={s.series_key} value={s.series_key}>{s.series_name || s.series_key}</option>)}
                    </select>
                  </td>
                  <td className={`${TD} ${NUM}`}><input value={specForm.default_height_cm} onChange={(e) => setSpecForm({ ...specForm, default_height_cm: e.target.value })} inputMode="numeric" placeholder="e.g. 135" className={INP} style={{ width: 90 }} /></td>
                  <td className={TD}><input value={specForm.source} onChange={(e) => setSpecForm({ ...specForm, source: e.target.value })} placeholder="e.g. ESNZ series conditions" className={INP} style={{ minWidth: 200 }} /></td>
                  <td className={`${TD} text-right`}><button onClick={saveSpec} disabled={busy} className={BTN_PRIMARY}>Add</button></td>
                </tr>
              </tbody>
            </table>
            </div>
            <div className="mt-3">
              <button onClick={applySpecs} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Applying…' : 'Apply specs to height-less classes'}</button>
            </div>
          </section>
          {!!noHeight.length && (
            <section className={CARD}>
              <h2 className="text-[14px] font-bold mb-1">Still missing height ({noHeight.length})</h2>
              <ul className="text-[12.5px] text-muted space-y-1">
                {noHeight.slice(0, 20).map((r) => <li key={r.class_id}>{r.name} <span className="text-faint">· {r.event} · {r.rounds} rounds</span></li>)}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === 'official' && (
        <section className={CARD}>
          <h2 className="text-[14px] font-bold mb-1">Cross-check against the official board</h2>
          <p className="text-[12.5px] text-muted mb-3">Paste an EvoEvents resultClass URL (per-series links on the ESNZ leaderboards page) or paste the board text as "Name points" lines. Differences come back for human verdict — never auto-applied.</p>
          <div className="grid gap-2.5 mb-3" style={{ maxWidth: 640 }}>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Our series
              <select value={checkSeries} onChange={(e) => setCheckSeries(e.target.value)} className={INP}>
                <option value="">Pick series…</option>
                {seriesList.map((s) => <option key={s.series_key} value={s.series_key}>{s.series_name || s.series_key}</option>)}
              </select></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Official board URL (optional)
              <input value={checkUrl} onChange={(e) => setCheckUrl(e.target.value)} placeholder="https://www.evoevents.co.nz/resultClass/…"
                className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">…or paste board text
              <textarea value={checkText} onChange={(e) => setCheckText(e.target.value)} rows={5} spellCheck={false}
                placeholder={'Lucy Fell 122\nMichelle Wakeling 113'}
                className="rounded border border-line bg-ink px-2.5 py-2 text-[13px] font-mono text-body placeholder:text-faint focus:border-gold/60 focus:outline-none" /></label>
          </div>
          <button onClick={runCheck} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Comparing…' : 'Compare boards'}</button>
          {!!diff && (
            <div className="mt-4 text-[13px]">
              <p className="text-muted mb-2">
                Matched <b className="text-white">{diff.matched}</b>
                {diff.bestOf ? <span> · best {diff.bestOf} applied both sides</span> : null}
                {diff.uncertain?.length ? <span> · <b className="text-gold">{diff.uncertain.length} uncertain name match(es)</b></span> : null}
              </p>
              {!!diff.deltas?.length && (
                <>
                  <h3 className="font-bold text-[13px] mt-3 mb-1">Point differences</h3>
                  <ul className="space-y-1">{diff.deltas.slice(0, 30).map((d, i) => (
                    <li key={i}>{d.rider}: ours <b>{d.ours}</b> vs official <b>{d.official}</b> (<span className={d.diff > 0 ? 'text-gold' : 'text-blood'}>{d.diff > 0 ? '+' : ''}{d.diff}</span>)</li>
                  ))}</ul>
                </>
              )}
              {!!diff.missingHere?.length && (
                <>
                  <h3 className="font-bold text-[13px] mt-3 mb-1">On the official board, missing here</h3>
                  <ul className="space-y-1 text-muted">{diff.missingHere.slice(0, 30).map((d, i) => <li key={i}>{d.rider} — official {d.official}</li>)}</ul>
                </>
              )}
              {!!diff.extraHere?.length && (
                <>
                  <h3 className="font-bold text-[13px] mt-3 mb-1">Scored here, absent officially</h3>
                  <ul className="space-y-1 text-muted">{diff.extraHere.slice(0, 30).map((d, i) => <li key={i}>{d.rider} — ours {d.ours}</li>)}</ul>
                </>
              )}
              {!!diff.uncertain?.length && (
                <>
                  <h3 className="font-bold text-[13px] mt-3 mb-1 text-gold">Uncertain matches (verify by eye)</h3>
                  <ul className="space-y-1 text-muted">{diff.uncertain.slice(0, 20).map((d, i) => <li key={i}>{d.official} ↔ {d.ours}</li>)}</ul>
                </>
              )}
              {!diff.deltas?.length && !diff.missingHere?.length && !diff.extraHere?.length && (
                <p className="text-gold font-bold">Boards agree.</p>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
