'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { CARD, H1, LINK, NUM, SUB, TABLE, TABLEWRAP, TD, TH } from '../../lib/tokens';
import { useSeason } from '../../components/global';
import Dropdown from '../../components/Dropdown';
import { Pagination } from '../../components/list-controls';
import { TableEmpty } from '../../components/EmptyState';
import { StatCard, StatGrid } from '../../components/StatCard';
import { keyOptions } from '../../lib/categories';

export default function SeriesIndex() {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState(null);
  const [q, setQ] = useState('');
  const [seasonF, setSeasonF] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
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
    fetch(`${API}/categories`).then((r) => r.json()).then((j) => setCats(j.data || [])).catch(() => setCats([]));
  }, []);

  const seasons = useMemo(
    () => [...new Set(rows.flatMap((x) => x.seasons || []).filter(Boolean))].sort().reverse(),
    [rows]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((x) =>
      (!seasonF || (x.seasons || []).includes(seasonF)) &&
      (!s || (x.series_name || '').toLowerCase().includes(s) || (x.series_key || '').toLowerCase().includes(s)));
  }, [rows, q, seasonF]);

  useEffect(() => { setPage(1); }, [q, seasonF]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const totalEntries = filtered.reduce((s, x) => s + Number(x.entries || 0), 0);
  // Distinct events across series — per-series counts double-count the same
  // shows (e.g. Rotorua + Feilding appear under every series they host).
  const distinctEvents = new Set(filtered.flatMap((x) => x.event_names || [])).size;

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
      <div className="mb-4 flex flex-wrap gap-2 items-center">
        <span className="text-[11px] uppercase tracking-wide text-faint font-bold">Rider categories:</span>
        {keyOptions(cats).map((o) => (
          <Link key={o.value} href={`/series/category/${o.value}`} className="text-xs rounded-full px-3 py-[6px] border border-line bg-card2 text-muted no-underline hover:text-gold hover:border-gold/50">{o.label}</Link>
        ))}
      </div>

      <StatGrid cols={4}>
        {[
          ['Series Tracked', String(filtered.length)],
          ['Total Entries', String(totalEntries)],
          ['Seasons', String(seasons.length)],
          ['Events', String(distinctEvents)],
        ].map(([l, v]) => (
          <StatCard key={l} label={l} value={v} />
        ))}
      </StatGrid>

      <div className="mb-4 flex flex-wrap items-end gap-2.5 rounded border border-line bg-card p-4">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Search
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Series…"
            className="w-[200px] rounded border border-line bg-ink px-2.5 py-2 text-[13px] normal-case text-white placeholder:text-faint focus:border-gold/60 focus:outline-none" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">
          Season
          <Dropdown ariaLabel="Season" value={seasonF} placeholder="All seasons"
            options={[{ value: '', label: 'All seasons' },
              ...seasons.map((s) => ({ value: s, label: s.replace('-', '/') }))]}
            onSelect={(o) => setSeasonF(o.value)} />
        </label>
        {(q || seasonF) && <button onClick={() => { setQ(''); setSeasonF(''); }} className="rounded px-2 py-2 text-[13px] text-sky hover:underline">Reset</button>}
      </div>

      <section className={CARD}>
        <div className={TABLEWRAP}>
        <table className={TABLE}>
          <thead><tr><th className={TH}>Series</th><th className={TH}>Seasons</th><th className={`${TH} ${NUM}`}>Events</th><th className={`${TH} ${NUM}`}>Classes</th><th className={`${TH} ${NUM}`}>Entries</th><th className={TH}></th></tr></thead>
          <tbody>
            {view.map((x) => (
              <tr key={x.series_key}>
                <td className={TD}><Link className={LINK} href={`/series/${x.series_key}`}><b>{x.series_name}</b></Link></td>
                <td className={TD}>{(x.seasons || []).map((s) => s.replace('-', '/')).join(', ') || '—'}</td>
                <td className={`${TD} ${NUM}`}>{x.events}</td>
                <td className={`${TD} ${NUM}`}>{x.classes}</td>
                <td className={`${TD} ${NUM}`}>{x.entries}</td>
                <td className={`${TD} ${NUM}`}><Link className={LINK} href={`/series/${x.series_key}`}>Standings →</Link></td>
              </tr>
            ))}
            {!view.length && (
              loading ? (
                <tr><td colSpan={6} className="px-2 py-4">
                  <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
                    {[0, 1, 2].map((i) => <span key={i} className="sk h-3.5 w-full" />)}
                  </span>
                </td></tr>
              ) : (
                <TableEmpty icon="🏆" title="No series match these filters" hint="Try a different season or search — or reset the filters." />
              )
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage} total={filtered.length} />
      </section>
    </>
  );
}
