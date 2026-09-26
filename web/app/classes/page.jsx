'use client';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, EMPTY, H1, SUB, TABLE, TABLEWRAP, TD, TH, NUM, INP, badge, BADGE } from '../../lib/tokens';
import { heightParams } from '../../lib/heights';
import { FilterBar, Pagination } from '../../components/list-controls';

const TYPES = ['Grand Prix', 'Premier', 'Open', 'Standard', 'Young Horse', 'Amateur', 'Pony'];

const diffBadge = (avg) => {
  const a = Number(avg);
  if (a >= 7) return ['Very High', BADGE.red];
  if (a >= 5) return ['High', BADGE.red];
  if (a >= 3) return ['Medium', BADGE.blue];
  return ['Low', BADGE.green];
};

export default function Classes() {
  const [f, setF] = useState({ q: '', season: '', region: '', arena: '', height: '', minStarts: '1', type: '', format: '' });
  const [rows, setRows] = useState([]);
  const [opts, setOpts] = useState({ seasons: [], regions: [], arenas: [], formats: [] });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => {
      const d = j.data || [];
      const uniq = (k) => [...new Set(d.map((x) => x[k]).filter(Boolean))].sort();
      setOpts({ seasons: uniq('season'), regions: uniq('region'), arenas: uniq('arena_type'), formats: [] });
    }).catch(() => {});
    fetch(`${API}/classes?limit=500`).then((r) => r.json()).then((j) => {
      setOpts((o) => ({ ...o, formats: [...new Set((j.data || []).map((x) => x.format).filter(Boolean))].sort() }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ limit: '200', ...heightParams(f.height) });
    if (f.season) p.set('season', f.season);
    if (f.region) p.set('region', f.region);
    if (f.arena) p.set('arena', f.arena);
    if (f.type) p.set('type', f.type);
    if (f.format) p.set('format', f.format);
    fetch(`${API}/classes?${p}`)
      .then((r) => r.json())
      .then((j) => { setRows(j.data || []); setPage(1); })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [f.season, f.region, f.arena, f.height, f.type, f.format]);

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((x) => (x.class || '').toLowerCase().includes(q) || (x.event || '').toLowerCase().includes(q));
  }, [rows, f.q]);
  useEffect(() => { setPage(1); }, [f.q]);

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const view = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <>
      <h1 className={H1}>Class Browser</h1>
      <p className={SUB}>Every class on the circuit — by height, type, format and series.</p>
      <FilterBar f={f} set={setF} seasons={opts.seasons} regions={opts.regions} arenas={opts.arenas} showMinStarts={false} />
      <div className="mb-4 flex flex-wrap gap-2.5 items-end rounded border border-line bg-card p-4">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Class type
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}
            className="bg-ink border border-line text-body rounded-lg px-2.5 py-2 text-[13px]">
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Format
          <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}
            className="bg-ink border border-line text-body rounded-lg px-2.5 py-2 text-[13px]">
            <option value="">All formats</option>
            {opts.formats.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></label>
        {(f.type || f.format) && <button onClick={() => setF({ ...f, type: '', format: '' })} className="rounded-lg px-2 py-2 text-[13px] text-sky hover:underline">Reset</button>}
      </div>
      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Class</th><th className={TH}>Event</th><th className={`${TH} ${NUM}`}>Height</th><th className={`${TH} ${NUM}`}>Starters</th><th className={`${TH} ${NUM}`}>Clear %</th><th className={`${TH} ${NUM}`}>Avg</th><th className={TH}>Difficulty</th></tr></thead>
          <tbody>
            {view.map((c) => {
              const [lbl, cls] = diffBadge(c.avg_faults);
              return (
                <tr key={c.class_id}>
                  <td className={TD}><b>{c.class}</b>{c.format && <span className="text-faint text-[11px] ml-1.5">{c.format}</span>}</td>
                  <td className={`${TD} text-muted`}>{c.event}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{c.height_cm ? `${c.height_cm}cm` : '–'}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{c.starters}</td>
                  <td className={`${TD} ${NUM} text-moss`}>{c.clear_pct === null ? '–' : `${Number(c.clear_pct).toFixed(0)}%`}</td>
                  <td className={`${TD} ${NUM} text-muted`}>{c.avg_faults === null ? '–' : Number(c.avg_faults).toFixed(2)}</td>
                  <td className={TD}><span className={badge(cls)}>{lbl}</span></td>
                </tr>
              );
            })}
            {!view.length && <tr><td colSpan={7} className={EMPTY}>{loading ? 'Loading…' : 'No classes match these filters.'}</td></tr>}
          </tbody>
        </table>
        </div>
        <Pagination page={page} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={filtered.length} />
      </section>
    </>
  );
}
