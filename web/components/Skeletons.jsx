// Professional skeleton loading states — mirrors real page layouts so the
// transition from loading → content feels seamless (no layout shift).
// Styling: global `.sk` shimmer in globals.css + existing CARD/tokens.

import { CARD, H1, H2, SUB } from '../lib/tokens';

export function Sk({ className = '', style }) {
  return <span className={`sk ${className}`} style={style} aria-hidden="true" />;
}

function PageHead({ pill = true, tabs = false }) {
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <Sk className="h-3 w-24" />
        {pill && <span className="ml-auto"><Sk className="h-6 w-28 !rounded-full" /></span>}
      </div>
      <div className={H1}><Sk className="h-8 w-72 !rounded-md" /></div>
      <p className={SUB}><Sk className="h-3.5 w-96 max-w-full" /></p>
      {tabs && (
        <div className="flex gap-1.5 mb-5">
          {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-8 w-28 !rounded-lg" />)}
        </div>
      )}
    </>
  );
}

function StatGrid({ n = 4, cols = 'grid-cols-2 lg:grid-cols-4' }) {
  return (
    <div className={`grid ${cols} gap-3 mb-6`}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="bg-card border border-line rounded p-4">
          <Sk className="h-2.5 w-20" />
          <Sk className="h-7 w-16 mt-2" />
        </div>
      ))}
    </div>
  );
}

export function TableSk({ cols = 5, rows = 6, title = true }) {
  return (
    <>
      {title && <h2 className={H2}><Sk className="h-5 w-44" /></h2>}
      <section className={CARD}>
        <div className="flex gap-2 mb-3">
          {Array.from({ length: cols }).map((_, i) => <Sk key={i} className="h-3 flex-1" />)}
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Sk className="h-8 w-8 !rounded-full shrink-0" />
              <Sk className="h-4 flex-[2]" />
              <Sk className="h-4 flex-1" />
              <Sk className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/** Skeleton rows injected inside a real <tbody> while client pages load. */
export function TableRowsSk({ rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td colSpan={99} className="px-2 py-2.5 border-b border-rowline">
            <span className="flex gap-2 items-center">
              <Sk className="h-7 w-7 !rounded-full shrink-0" />
              <Sk className="h-3.5 flex-[2]" />
              <Sk className="h-3.5 flex-1" />
              <Sk className="h-3.5 w-14" />
            </span>
          </td>
        </tr>
      ))}
    </>
  );
}

function HeroSk() {
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
      <section className="rounded border border-line bg-card p-5">
        <Sk className="h-2.5 w-28" />
        <Sk className="h-9 w-64 mt-2 !rounded-md" />
        <div className="mt-4 space-y-2">
          <Sk className="h-3.5 w-full" />
          <Sk className="h-3.5 w-5/6" />
        </div>
        <div className="mt-4 flex gap-2">
          <Sk className="h-7 w-36 !rounded-md" />
          <Sk className="h-7 w-28 !rounded-md" />
        </div>
      </section>
      <section className="rounded border border-line bg-card p-5">
        <Sk className="h-4 w-40 mb-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between py-2 border-b border-line/60 last:border-0">
            <Sk className="h-3 w-20" />
            <Sk className="h-3 w-24" />
          </div>
        ))}
      </section>
    </div>
  );
}

function FilterBarSk() {
  return (
    <div className="mb-4 flex flex-wrap gap-2.5 rounded border border-line bg-card p-4">
      {[160, 130, 130, 130, 110].map((w, i) => <Sk key={i} className="h-9" style={{ width: w }} />)}
    </div>
  );
}

/* ---------------- page-level skeletons ---------------- */

export function LandingSk() {
  return (
    <>
      <section className="relative overflow-hidden rounded border border-line bg-card mb-6 p-6 md:p-10">
        <Sk className="h-6 w-56 !rounded-full" />
        <Sk className="h-14 md:h-[76px] w-80 max-w-full mt-4 !rounded-lg" />
        <Sk className="h-4 w-72 mt-3" />
        <Sk className="h-3.5 w-[560px] max-w-full mt-3" />
        <Sk className="h-3.5 w-[420px] max-w-full mt-2" />
        <div className="flex gap-2.5 mt-5">
          <Sk className="h-11 w-44 !rounded-md" />
          <Sk className="h-11 w-44 !rounded-md" />
        </div>
        <div className="flex gap-6 mt-6">
          {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-3.5 w-32 hidden sm:block" />)}
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-3 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded border border-line bg-card p-4">
            <Sk className="h-4 w-32" />
            <Sk className="h-3.5 w-full mt-2" />
            <Sk className="h-3.5 w-4/5 mt-1.5" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TableSk cols={3} rows={5} />
        <TableSk cols={3} rows={5} />
      </div>
    </>
  );
}

export function DashboardSk() {
  return (
    <>
      <PageHead tabs />
      <StatGrid n={6} cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6" />
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <section className="rounded border border-line bg-card p-5">
          <Sk className="h-5 w-52 mb-3" />
          <Sk className="h-44 w-full !rounded-lg" />
        </section>
        <section className="rounded border border-line bg-card p-5">
          <Sk className="h-5 w-40 mb-3" />
          {[0, 1, 2].map((i) => <Sk key={i} className="h-9 w-full !rounded-md mb-2" />)}
        </section>
      </div>
      <TableSk cols={6} rows={5} />
      <TableSk cols={6} rows={4} />
    </>
  );
}

export function ProfileSk() {
  return (
    <div className="text-[14px]">
      <div className="mb-1"><Sk className="h-3 w-48" /></div>
      <div className="mb-5 flex items-center justify-between">
        <Sk className="h-7 w-80 max-w-full !rounded-md" />
        <Sk className="h-6 w-28 !rounded-full" />
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Sk className="h-2.5 w-24" />
              <Sk className="h-9 w-56 mt-2 !rounded-md" />
            </div>
            <Sk className="h-[92px] w-[92px] !rounded-full shrink-0" />
          </div>
          <Sk className="h-14 w-full mt-4 !rounded-lg" />
          <div className="mt-3 flex gap-2">
            <Sk className="h-7 w-32 !rounded-md" />
            <Sk className="h-7 w-28 !rounded-md" />
          </div>
        </section>
        <section className="rounded border border-line bg-card p-5">
          <Sk className="h-4 w-40 mb-2" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex justify-between py-[9px] border-b border-line/60 last:border-0">
              <Sk className="h-3 w-16" />
              <Sk className="h-3 w-24" />
            </div>
          ))}
        </section>
      </div>
      <h2 className="text-[15px] font-bold mb-3"><Sk className="h-5 w-52" /></h2>
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="rounded border border-line bg-card p-3.5">
            <Sk className="h-2.5 w-16" />
            <Sk className="h-7 w-14 mt-2" />
          </div>
        ))}
      </div>
      <TableSk cols={8} rows={6} />
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-4">
          <Sk className="h-4 w-48 mb-2" />
          <Sk className="h-[220px] w-full !rounded-lg" />
        </section>
        <div className="grid gap-4 content-start">
          {[0, 1].map((i) => (
            <section key={i} className="rounded border border-line bg-card p-4">
              <Sk className="h-4 w-36 mb-2" />
              <Sk className="h-16 w-full !rounded-md" />
            </section>
          ))}
        </div>
      </div>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <section key={i} className="rounded border border-line bg-card p-5">
            <Sk className="h-4 w-40 mb-3" />
            <Sk className="h-14 w-full !rounded-lg mb-2" />
            <Sk className="h-3 w-full" />
            <Sk className="h-3 w-4/5 mt-1.5" />
          </section>
        ))}
      </div>
    </div>
  );
}

export function EventDetailSk() {
  return (
    <>
      <PageHead />
      <section className="rounded border border-line bg-card p-5 mb-6">
        <div className="flex gap-5 items-center">
          <Sk className="h-24 w-24 !rounded-full shrink-0" />
          <div className="flex-1">
            <Sk className="h-6 w-72 max-w-full !rounded-md" />
            <Sk className="h-3 w-96 max-w-full mt-2" />
          </div>
        </div>
      </section>
      <StatGrid n={7} cols="grid-cols-2 md:grid-cols-4 xl:grid-cols-7" />
      <TableSk cols={6} rows={5} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="rounded border border-line bg-card p-5 mb-6">
          <Sk className="h-5 w-48 mb-3" />
          {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-8 w-full !rounded-md mb-2" />)}
        </section>
        <TableSk cols={4} rows={4} />
      </div>
      <TableSk cols={5} rows={5} />
    </>
  );
}

export function RankingsSk() {
  return (
    <>
      <PageHead tabs />
      <div className="flex flex-wrap gap-2 mb-5">
        {[0, 1, 2, 3, 4, 5].map((i) => <Sk key={i} className="h-7 w-24 !rounded-full" />)}
      </div>
      <TableSk cols={7} rows={8} />
      <TableSk cols={7} rows={6} />
    </>
  );
}

export function ListSk({ filters = true } = {}) {
  return (
    <>
      <PageHead />
      {filters && <FilterBarSk />}
      <TableSk cols={6} rows={8} title={false} />
      <div className="mt-4 flex items-center justify-between">
        <Sk className="h-3.5 w-48" />
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => <Sk key={i} className="h-8 w-8 !rounded-lg" />)}
        </div>
      </div>
    </>
  );
}

export function SeriesDetailSk() {
  return (
    <>
      <PageHead />
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <section className="rounded border border-line bg-card p-5">
          <Sk className="h-2.5 w-28" />
          <Sk className="h-8 w-80 max-w-full mt-2 !rounded-md" />
          <div className="flex gap-8 mt-3">
            <Sk className="h-9 w-28" />
            <Sk className="h-9 w-40" />
          </div>
        </section>
        <section className="rounded border border-line bg-card p-5">
          <Sk className="h-4 w-36 mb-2" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between py-2 border-b border-line/60 last:border-0">
              <Sk className="h-3 w-20" />
              <Sk className="h-3 w-16" />
            </div>
          ))}
        </section>
      </div>
      <StatGrid n={4} cols="grid-cols-2 lg:grid-cols-4" />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded border border-line bg-card p-4">
            <Sk className="h-4 w-32 mb-1" />
            <Sk className="h-3.5 w-40" />
            <Sk className="h-6 w-20 mt-2" />
          </div>
        ))}
      </div>
      <TableSk cols={6} rows={8} />
    </>
  );
}

export function VenueDetailSk() {
  return (
    <>
      <PageHead />
      <StatGrid n={3} cols="grid-cols-2 lg:grid-cols-3" />
      <div className="grid gap-5 lg:grid-cols-2">
        <TableSk cols={3} rows={5} />
        <div>
          <TableSk cols={3} rows={5} />
          <TableSk cols={3} rows={5} />
        </div>
      </div>
    </>
  );
}

export function WatchlistSk() {
  return (
    <>
      <PageHead />
      <StatGrid n={4} cols="grid-cols-2 xl:grid-cols-4" />
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-5 items-start">
        <div>
          <TableSk cols={6} rows={5} />
          <TableSk cols={5} rows={4} />
        </div>
        <div>
          <h2 className="text-[17px] font-bold mb-0.5"><Sk className="h-5 w-48" /></h2>
          <div className="space-y-2.5 mb-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card border border-line rounded p-3">
                <Sk className="h-3.5 w-3/4" />
                <Sk className="h-3 w-full mt-2" />
              </div>
            ))}
          </div>
          <section className="rounded border border-line bg-card px-5 py-[18px] mb-6">
            <Sk className="h-5 w-40 mb-2" />
            <Sk className="h-3 w-full" />
            <Sk className="h-3 w-5/6 mt-1.5" />
          </section>
        </div>
      </div>
    </>
  );
}

export function AdminSk() {
  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr] items-start">
      <aside className="rounded border border-line bg-card p-2">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <Sk className="h-8 w-8 !rounded-md shrink-0" />
          <div>
            <Sk className="h-3.5 w-24" />
            <Sk className="h-2.5 w-20 mt-1" />
          </div>
        </div>
        {[0, 1, 2].map((g) => (
          <div key={g}>
            <div className="px-2.5 pt-3 pb-1"><Sk className="h-2.5 w-16" /></div>
            {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-9 w-full !rounded-md mb-0.5" />)}
          </div>
        ))}
      </aside>
      <div className="min-w-0">
        <PageHead />
        <StatGrid n={4} cols="grid-cols-2 md:grid-cols-4" />
        <TableSk cols={5} rows={6} />
      </div>
    </div>
  );
}

export function AnalyticsSk() {
  return (
    <>
      <PageHead tabs />
      <StatGrid n={4} cols="grid-cols-2 lg:grid-cols-4" />
      <TableSk cols={6} rows={6} />
      <TableSk cols={5} rows={6} />
    </>
  );
}
