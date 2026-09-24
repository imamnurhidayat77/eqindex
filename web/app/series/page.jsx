'use client';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, EMPTY, H1, LINK, NUM, SUB, TABLE, TABLEWRAP, TD, TH } from '../../lib/tokens';
import { useSeason } from '../../components/global';

export default function SeriesIndex() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [seasonF, setSeasonF] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { season: gSeason } = useSeason();
  useEffect(() => { setSeasonF(gSeason); }, [gSeason]);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/series`)
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const seasons = useMemo(
    () => [...new Set(rows.map((x) => x.season).filter(Boolean))].sort().reverse(),
    [rows]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((x) =>
      (!seasonF || x.season === seasonF) &&
      (!s || (x.series_name || '').toLowerCase().includes(s) || (x.event_name || '').toLowerCase().includes(s)));
  }, [rows, q, seasonF]);

  useEffect(() => { setPage(1); }, [q, seasonF]);
  const perPage = 12;
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const view = filtered.slice((page - 1) * perPage, page * perPage);
  const totalEntries = filtered.reduce((s, x) => s + Number(x.entries || 0), 0);

  return (
    <>
      <div className="mb-1 text-[12px] text-faint">
        <span className="text-muted">Circuit</span><span className="mx-1.5">/</span><span className="text-gold">Series</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Series Intelligence</h1>
        <span className="rounded-full border border-gold/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">◦ National Circuit</span>
      </div>
      <p className={SUB}>Season-long points races across the NZ showjumping circuit.</p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Series Tracked', String(filtered.length)],
          ['Total Entries', String(totalEntries)],
          ['Seasons', String(seasons.length)],
          ['Events', String(new Set(filtered.map((x) => x.event_name)).size)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line bg-card p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{l}</div>
            <div className="mt-1 text-[26px] font-extrabold leading-none">{v}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2.5 rounded-xl border border-line bg-card p-4">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Series or event…"
            className="w-[200px] rounded-lg border border-line bg-ink px-2.5 py-2 text-[13px] normal-case text-white placeholder:text-faint focus:border-gold/60 focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Season
          <select value={seasonF} onChange={(e) => setSeasonF(e.target.value)}
            className="rounded-lg border border-line bg-ink px-2.5 py-2 text-[13px] text-body">
            <option value="">All seasons</option>
            {seasons.map((s) => <option key={s} value={s}>{s.replace('-', '/')}</option>)}
          </select>
        </label>
        {(q || seasonF) && <button onClick={() => { setQ(''); setSeasonF(''); }} className="rounded-lg px-2 py-2 text-[13px] text-sky hover:underline">Reset</button>}
      </div>

      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Series</th><th className={TH}>Event</th><th className={TH}>Season</th><th className={`${TH} ${NUM}`}>Entries</th><th className={TH}></th></tr></thead>
          <tbody>
            {view.map((x) => (
              <tr key={x.series_key}>
                <td className={TD}><a className={LINK} href={`/series/${x.series_key}`}><b>{x.series_name}</b></a></td>
                <td className={TD}>{x.event_name}</td>
                <td className={TD}>{(x.season || '').replace('-', '/')}</td>
                <td className={`${TD} ${NUM}`}>{x.entries}</td>
                <td className={`${TD} ${NUM}`}><a className={LINK} href={`/series/${x.series_key}`}>Standings →</a></td>
              </tr>
            ))}
            {!view.length && <tr><td colSpan={5} className={EMPTY}>{loading ? 'Loading…' : 'No series match these filters.'}</td></tr>}
          </tbody>
        </table>
        </div>
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-[12.5px] text-muted">Page {page} of {pages}</div>
            <div className="flex gap-1.5">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-line bg-card2 px-3 py-1.5 text-[13px] text-muted disabled:opacity-40">‹</button>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-line bg-card2 px-3 py-1.5 text-[13px] text-muted disabled:opacity-40">›</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
