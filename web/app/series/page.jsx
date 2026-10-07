'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { H1, SUB } from '../../lib/tokens';
import { useSeason } from '../../components/global';
import Dropdown from '../../components/Dropdown';

// Age-based horse series vs rider/class series (per Charles sketch).
const isHorseSeries = (k) => /yo-series|young-horse/.test(k || '');

function SeriesBox({ x }) {
  return (
    <Link
      href={`/series/${x.series_key}`}
      className="group flex items-center justify-between rounded border border-line bg-card p-4 no-underline transition hover:border-gold/50"
    >
      <div className="min-w-0">
        <div className="text-[15px] font-bold text-white group-hover:text-gold leading-tight">{x.series_name}</div>
        <div className="mt-1 text-[12px] text-muted">
          {x.entries} entries · {x.events} events · {x.classes} classes
        </div>
      </div>
      <span className="text-gold transition group-hover:translate-x-0.5 shrink-0 ml-3">→</span>
    </Link>
  );
}

export default function SeriesIndex() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [seasonF, setSeasonF] = useState('');
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
    () => [...new Set(rows.flatMap((x) => x.seasons || []).filter(Boolean))].sort().reverse(),
    [rows]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((x) =>
      (!seasonF || (x.seasons || []).includes(seasonF)) &&
      (!s || (x.series_name || '').toLowerCase().includes(s) || (x.series_key || '').toLowerCase().includes(s)));
  }, [rows, q, seasonF]);

  const classSeries = filtered.filter((x) => !isHorseSeries(x.series_key));
  const horseSeries = filtered.filter((x) => isHorseSeries(x.series_key));

  return (
    <>
      <div className="mb-1 text-[12px] text-faint">
        <span className="text-muted">Circuit</span><span className="mx-1.5">/</span><span className="text-gold">Series</span>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Series</h1>
        <span className="rounded-full border border-gold/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-gold">◦ National Circuit</span>
      </div>
      <p className={SUB}>Season-long points races across the NZ showjumping circuit.</p>

      <div className="mb-5 flex flex-wrap items-end gap-2.5 rounded border border-line bg-card p-4">
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

      {loading ? (
        <span className="flex flex-col gap-2 py-1" aria-hidden="true" aria-label="Loading">
          {[0, 1, 2].map((i) => <span key={i} className="sk h-12 w-full" />)}
        </span>
      ) : (
        <>
          {!!classSeries.length && (
            <>
              <h2 className="mb-3 text-[15px] font-bold">Class Series</h2>
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                {classSeries.map((x) => <SeriesBox key={x.series_key} x={x} />)}
              </div>
            </>
          )}
          {!!horseSeries.length && (
            <>
              <h2 className="mb-3 text-[15px] font-bold">Horse Series</h2>
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                {horseSeries.map((x) => <SeriesBox key={x.series_key} x={x} />)}
              </div>
            </>
          )}
          {!classSeries.length && !horseSeries.length && (
            <p className="text-muted text-sm">No series match these filters — try a different season or search.</p>
          )}
        </>
      )}
    </>
  );
}
