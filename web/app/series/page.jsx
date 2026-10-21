'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../lib/api';
import { H1, SUB } from '../../lib/tokens';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/series`)
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows;

  const classSeries = filtered.filter((x) => !isHorseSeries(x.series_key));
  const horseSeries = filtered.filter((x) => isHorseSeries(x.series_key));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Series</h1>
      </div>
      <p className={SUB}>Season-long points races across the NZ showjumping circuit.</p>

      {loading ? (
        <span className="grid gap-4 md:grid-cols-3 mb-6" aria-hidden="true" aria-label="Loading">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="flex items-center justify-between rounded border border-line bg-card p-4">
              <span className="min-w-0">
                <span className="sk block h-[15px] w-40 !rounded" />
                <span className="sk mt-1 block h-3 w-56 !rounded" />
              </span>
              <span className="sk h-4 w-4 shrink-0 ml-3 !rounded" />
            </span>
          ))}
        </span>
      ) : (
        <>
          {!!classSeries.length && (
            <>
              <h2 className="mb-3 text-[22px] font-extrabold tracking-tight">Class Series</h2>
              <div className="grid gap-4 md:grid-cols-3 mb-6">
                {classSeries.map((x) => <SeriesBox key={x.series_key} x={x} />)}
              </div>
            </>
          )}
          {!!horseSeries.length && (
            <>
              <h2 className="mb-3 text-[22px] font-extrabold tracking-tight">Horse Series</h2>
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
