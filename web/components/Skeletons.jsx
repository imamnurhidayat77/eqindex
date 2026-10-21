// Professional skeleton loading states — mirrors real page layouts so the
// transition from loading → content feels seamless (no layout shift).
// Styling: global `.sk` shimmer in globals.css + existing CARD/tokens.

import { CARD, H1, H2, SUB } from '../lib/tokens';

export function Sk({ className = '', style }) {
  return <span className={`sk ${className}`} style={style} aria-hidden="true" />;
}

export function StatGrid({ n = 4, cols = 'grid-cols-2 lg:grid-cols-4' }) {
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

export function TableSk({ cols = 5, rows = 8, title = true }) {
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
export function TableRowsSk({ rows = 8 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          <td colSpan={99} className="px-2 py-2.5 border-b border-rowline">
            <span className="flex gap-2 items-center">
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
      <section className="rounded-lg border border-line bg-card p-5">
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
      <section className="rounded-lg border border-line bg-card p-5">
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
    <div className="mb-4 flex flex-wrap gap-2.5 rounded-lg border border-line bg-card p-4">
      {[160, 130, 130, 130, 110].map((w, i) => <Sk key={i} className="h-9" style={{ width: w }} />)}
    </div>
  );
}

/* ---------------- page-level skeletons ---------------- */

export function LandingSk() {
  // Mirrors app/page.jsx: Events header + Show 10/12 toggle + horizontal
  // EventCarousel (240px cards in a scroll row). No hero, no stats, no tables.
  return (
    <>
      <div className="flex items-baseline justify-between mb-4">
        <Sk className="h-7 w-28 !rounded-md" />
        <div className="flex items-center gap-2">
          <Sk className="h-3 w-10" />
          <Sk className="h-6 w-8 !rounded" />
          <Sk className="h-6 w-8 !rounded" />
          <Sk className="h-3 w-20" />
        </div>
      </div>
      <section className="rounded-lg border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <Sk className="h-3.5 w-48" />
          <Sk className="h-3 w-20" />
        </div>
        <div className="flex gap-3 overflow-hidden pb-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="shrink-0 w-[240px] rounded-lg border border-line bg-card2 p-4">
              <div className="flex items-center justify-between gap-2">
                <Sk className="h-3 w-20" />
                <Sk className="h-3 w-12" />
              </div>
              <Sk className="h-4 w-full mt-2.5" />
              <Sk className="h-3 w-3/4 mt-1.5" />
              <Sk className="h-3 w-1/2 mt-1.5" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function ProfileSk() {
  // Mirrors horses/[id] + riders/[id]: breadcrumb, H1 row (title + pill, NO
  // avatar photo anywhere), hero card (label + big name + medals / rating +
  // watch button), StatGrid cols=7, history table, timeline strip, registry
  // list, photo strip. No side panel, no big chart card.
  return (
    <div className="text-[14px]">
      <div className="mb-1"><Sk className="h-3 w-56" /></div>
      <div className="mb-5 flex items-center justify-between">
        <Sk className="h-7 w-80 max-w-full !rounded-md" />
        <Sk className="h-6 w-28 !rounded-full" />
      </div>
      <section className="rounded-lg border border-line bg-card p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Sk className="h-2.5 w-24" />
            <Sk className="h-9 w-64 max-w-full mt-2 !rounded-md" />
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Sk className="h-9 w-40 !rounded-full" />
              <Sk className="h-9 w-36 !rounded-full" />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            <Sk className="h-7 w-14" />
            <Sk className="h-2.5 w-20" />
            <Sk className="h-8 w-28 !rounded-md" />
          </div>
        </div>
      </section>
      <h2 className="text-[15px] font-bold mb-3"><Sk className="h-5 w-56" /></h2>
      <StatGrid n={7} cols="grid-cols-2 sm:grid-cols-4 xl:grid-cols-7" />
      <TableSk cols={6} rows={6} />
      <Sk className="h-20 w-full !rounded-lg mb-6" />
      <section className="rounded-lg border border-line bg-card p-5 mb-6">
        <Sk className="h-4 w-32 mb-2" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between py-[9px] border-b border-line/60 last:border-0">
            <Sk className="h-3 w-20" />
            <Sk className="h-3 w-32" />
          </div>
        ))}
      </section>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Sk key={i} className="aspect-[4/3] !rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function EventDetailSk() {
  // Mirrors app/events/[id]/page.jsx: H1 + LIVE badge, Active Competition
  // Summary text card (no avatar anywhere), StatGrid cols=7, Class Results
  // accordion groups, difficulty table, 2 distribution bars, 2 top-5 tables,
  // photo + reel strips. No generic tables.
  return (
    <>
      <div className="mb-1 flex items-center gap-3">
        <Sk className="h-8 w-72 max-w-full !rounded-md" />
        <span className="ml-auto"><Sk className="h-5 w-32 !rounded-full" /></span>
      </div>
      <p className={SUB}><Sk className="h-3.5 w-80 max-w-full" /></p>
      <section className="rounded-lg border border-line bg-card p-5 mb-6">
        <Sk className="h-5 w-64 mb-3" />
        <Sk className="h-3.5 w-full" />
        <Sk className="h-3.5 w-5/6 mt-1.5" />
        <Sk className="h-3.5 w-4/6 mt-1.5" />
      </section>
      <StatGrid n={7} cols="grid-cols-2 md:grid-cols-4 xl:grid-cols-7" />
      {[0, 1, 2].map((i) => (
        <section key={i} className="rounded-lg border border-line bg-card p-4 mb-4">
          <div className="flex items-center justify-between">
            <Sk className="h-4 w-56 max-w-full" />
            <Sk className="h-3 w-20" />
          </div>
        </section>
      ))}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <section className="rounded-lg border border-line bg-card p-5">
          <Sk className="h-5 w-56 mb-3" />
          <Sk className="h-24 w-full !rounded-lg" />
        </section>
        <section className="rounded-lg border border-line bg-card p-5">
          <Sk className="h-5 w-56 mb-3" />
          <Sk className="h-24 w-full !rounded-lg" />
        </section>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <TableSk cols={3} rows={5} />
        <TableSk cols={3} rows={5} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Sk key={i} className="aspect-[4/3] !rounded-lg" />
        ))}
      </div>
    </>
  );
}

export function RankingsSk() {
  // Mirrors app/rankings/page.jsx: 5 tabs + chip filters, then tables.
  return (
    <>
      <div className="mb-1"><Sk className="h-8 w-44 !rounded-md" /></div>
      <p className={SUB}><Sk className="h-3.5 w-80 max-w-full" /></p>
      <div className="flex gap-1 bg-card border border-line rounded p-1.5 mb-3 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => <Sk key={i} className="h-8 w-28 !rounded-md shrink-0" />)}
      </div>
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        {[0, 1, 2, 3, 4].map((i) => <Sk key={i} className="h-8 w-32 !rounded-md" />)}
        {[0, 1, 2].map((i) => <Sk key={i} className="h-7 w-28 !rounded-full" />)}
      </div>
      <TableSk cols={8} rows={8} />
      <TableSk cols={6} rows={5} />
    </>
  );
}

export function ListSk({ filters = false } = {}) {
  // Mirrors app/venues/page.jsx: H1 + sub + one CARD table (Venue/Region/
  // Events/Rounds/Open, no avatars). No filter bar, no pagination.
  return (
    <>
      <div className="mb-1"><Sk className="h-8 w-40 !rounded-md" /></div>
      <p className={SUB}><Sk className="h-3.5 w-72 max-w-full" /></p>
      {filters && <FilterBarSk />}
      <section className={CARD}>
        <div className="flex gap-2 mb-3">
          {[0, 1, 2, 3, 4].map((_, i) => <Sk key={i} className="h-3 flex-1" />)}
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Sk className="h-4 flex-[2]" />
              <Sk className="h-4 flex-1" />
              <Sk className="h-4 w-14" />
              <Sk className="h-4 w-14" />
              <Sk className="h-4 w-16 ml-auto" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function SeriesDetailSk() {
  // Mirrors app/series/[key]/page.jsx: breadcrumb + H1 + Points Race pill,
  // Standings header + sub + one SeriesRiderTable card. No hero, no stats.
  return (
    <>
      <div className="mb-1 text-[12px]"><Sk className="h-3 w-48" /></div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Sk className="h-8 w-72 max-w-full !rounded-md" />
        <Sk className="h-6 w-32 !rounded-full" />
      </div>
      <Sk className="h-5 w-32 mb-1" />
      <p className="mb-3"><Sk className="h-3.5 w-96 max-w-full" /></p>
      <section className="mb-6 rounded-lg border border-line bg-card p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-2 items-center py-2.5 border-b border-rowline last:border-0">
            <Sk className="h-3.5 w-8" />
            <Sk className="h-3.5 flex-[2]" />
            <Sk className="h-3.5 w-20" />
            <Sk className="h-3.5 w-20 hidden sm:block" />
            <Sk className="h-3.5 w-16 ml-auto" />
          </div>
        ))}
      </section>
    </>
  );
}

export function VenueDetailSk() {
  // Mirrors app/venues/[id]/page.jsx: H1 + sub, then grid lg:grid-cols-2 —
  // Events table left, Top horses + Top riders stacked right. No stat cards.
  return (
    <>
      <div className="mb-1"><Sk className="h-8 w-56 max-w-full !rounded-md" /></div>
      <p className={SUB}><Sk className="h-3.5 w-72 max-w-full" /></p>
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
  // Mirrors the current watchlist: pulse bar + search, event chips, then
  // per-event sections (athlete rows + photo strips). No result tabs, no
  // watched-athlete chips row.
  return (
    <>
      <div className="bg-card border border-line rounded p-4 mb-5 flex items-center gap-4">
        <div>
          <Sk className="h-2.5 w-24" />
          <Sk className="h-5 w-72 max-w-full mt-2" />
        </div>
        <span className="flex-1" />
        <Sk className="h-9 w-64 !rounded-md hidden sm:block" />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4 items-center">
        {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-6 w-24 !rounded-full" />)}
      </div>
      {[0, 1].map((s) => (
        <section key={s} className="bg-card border border-line rounded p-4 mb-4">
          <div className="flex items-baseline gap-3 mb-1">
            <Sk className="h-5 w-56 max-w-full" />
            <span className="ml-auto"><Sk className="h-3 w-16" /></span>
          </div>
          <Sk className="h-3.5 w-72 max-w-full mb-2.5" />
          <div className="space-y-1.5">
            {[0, 1].map((i) => (
              <div key={i} className="rounded bg-card2 border border-rowline px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Sk className="h-2.5 w-10" />
                  <Sk className="h-4 w-40" />
                  <Sk className="h-3 w-48 hidden sm:block" />
                  <span className="flex-1" />
                  <Sk className="h-7 w-28 !rounded-md" />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mt-2">
                  {[0, 1, 2, 3].map((t) => (
                    <Sk key={t} className="aspect-square !rounded-md" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export function AdminSk() {
  // Admin layout renders AdminNav persistently — loading.jsx only replaces
  // {children}, so NO sidebar here (it used to double it).
  return (
    <div className="min-w-0">
      <div className="mb-1"><Sk className="h-8 w-56 !rounded-md" /></div>
      <p className={SUB}><Sk className="h-3.5 w-80 max-w-full" /></p>
      <section className="rounded border border-gold/50 bg-goldbg/20 px-5 py-3.5 mb-5">
        <Sk className="h-4 w-72 max-w-full" />
      </section>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card border border-line rounded p-4">
            <Sk className="h-2.5 w-20" />
            <Sk className="h-7 w-16 mt-2" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr] items-start mb-5">
        <section className="rounded-lg border border-line bg-card p-4">
          <Sk className="h-5 w-48 mb-3" />
          <Sk className="h-44 w-full !rounded-lg" />
        </section>
        <section className="rounded-lg border border-line bg-card p-4">
          <Sk className="h-5 w-40 mb-3" />
          {[0, 1, 2].map((i) => <Sk key={i} className="h-9 w-full !rounded-md mb-2" />)}
        </section>
      </div>
    </div>
  );
}

export function AnalyticsSk() {
  // Mirrors app/analytics/page.jsx: H1 + sub, then two titled sections each
  // with 2 ChipSelect pills and one CARD table. No tabs, no stat grid.
  const section = (title) => (
    <div key={title} className="mb-6">
      <Sk className="h-5 w-48 mb-3" />
      <div className="flex flex-wrap gap-2 mb-3">
        <Sk className="h-8 w-40 !rounded-md" />
        <Sk className="h-8 w-36 !rounded-md" />
      </div>
      <section className={CARD}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-2 items-center py-2 border-b border-rowline last:border-0">
            <Sk className="h-3.5 flex-[2]" />
            <Sk className="h-3.5 flex-1" />
            <Sk className="h-3.5 flex-1" />
            <Sk className="h-3.5 w-16 ml-auto" />
          </div>
        ))}
      </section>
    </div>
  );
  return (
    <>
      <div className="mb-1"><Sk className="h-8 w-44 !rounded-md" /></div>
      <p className={SUB}><Sk className="h-3.5 w-80 max-w-full" /></p>
      {section('Class difficulty')}
      {section('Height progression')}
    </>
  );
}

/* ---------------- media shop skeletons ---------------- */

// Mirrors the gallery / wall photo cards (4:3 thumb + 2 caption lines +
// footer row) so the grid doesn't jump when photos land.
export function PhotoCardSk({ n = 8 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line bg-card overflow-hidden">
          <Sk className="aspect-[4/3] !rounded-none" />
          <div className="p-2.5">
            <Sk className="h-3.5 w-4/5" />
            <Sk className="h-3 w-3/5 mt-1.5" />
            <div className="flex justify-between mt-2">
              <Sk className="h-3 w-12" />
              <Sk className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Mirrors the gallery event cards (16:9 cover + title/date/count).
export function EventCardSk({ n = 6 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line bg-card overflow-hidden">
          <Sk className="aspect-[16/9] !rounded-none" />
          <div className="p-3">
            <Sk className="h-4 w-3/4" />
            <Sk className="h-3 w-24 mt-1.5" />
            <div className="flex justify-between mt-2">
              <Sk className="h-3 w-20" />
              <Sk className="h-3 w-14" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Gallery filter bar mirror: kind tabs + text search + rider picker.
export function GalleryFilterSk() {
  return (
    <div className="rounded-lg border border-line bg-card p-3 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-card2 border border-line rounded p-1 w-fit">
          {[0, 1, 2].map((i) => <Sk key={i} className="h-8 w-20 !rounded-md" />)}
        </div>
        <Sk className="h-10 grow min-w-[180px] !rounded-md" />
        <Sk className="h-10 w-44 !rounded-md" />
      </div>
    </div>
  );
}

export function PhotosGallerySk() {
  // Default gallery mode is event browsing (16:9 cards); filtered mode
  // (?horse=/?rider=/?event=) shows the photo grid — loading.jsx can't read
  // params, so the skeleton matches the common landing.
  return (
    <>
      <div className="mb-1 flex items-center gap-3">
        <div className={H1}><Sk className="h-8 w-40 !rounded-md" /></div>
        <Sk className="h-6 w-24 !rounded-full" />
      </div>
      <p className={SUB}><Sk className="h-3.5 w-96 max-w-full" /></p>
      <GalleryFilterSk />
      <EventCardSk n={6} />
    </>
  );
}

// Photo detail (UUID): breadcrumb + title + moment badge, then 2-col
// commerce layout — viewer left, details/buybox/upsell sidebar right.
// (Event-slug wall mode keeps PhotoWallSk.)
export function PhotoDetailSk() {
  return (
    <>
      <div className="mb-1"><Sk className="h-3 w-56" /></div>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className={H1} style={{ marginBottom: 0 }}><Sk className="h-8 w-80 max-w-full !rounded-md" /></div>
        <Sk className="h-5 w-24 !rounded-md" />
      </div>
      <p className={SUB}><Sk className="h-3.5 w-64 max-w-full" /></p>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] items-start">
        <section className="bg-card border border-line rounded overflow-hidden">
          <Sk className="aspect-[4/3] !rounded-none" />
          <div className="px-5 py-4 space-y-2">
            <Sk className="h-3 w-3/4" />
            <Sk className="h-9 w-40 !rounded-md" />
          </div>
        </section>
        <div className="lg:sticky lg:top-[76px]">
          <section className={CARD} style={{ marginBottom: 0 }}>
            <Sk className="h-3 w-24 mb-2" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-3 border-b border-rowline last:border-0 py-2">
                <Sk className="h-3 w-16" />
                <Sk className="h-3 w-28" />
              </div>
            ))}
            <Sk className="h-10 w-full !rounded-md mt-3" />
            <Sk className="h-24 w-full !rounded-lg mt-3" />
            <Sk className="h-24 w-full !rounded-lg mt-2" />
          </section>
        </div>
      </div>
    </>
  );
}

// Event photo wall (/photos/<slug>): breadcrumb + title + filter row + grid.
// (Photo wall is legacy; detail mode uses PhotoDetailSk above.)
export function PhotoWallSk() {
  return (
    <>
      <div className="mb-1"><Sk className="h-3 w-56" /></div>
      <div className="mb-1 flex items-center gap-3">
        <div className={H1}><Sk className="h-8 w-80 max-w-full !rounded-md" /></div>
      </div>
      <p className={SUB}><Sk className="h-3.5 w-96 max-w-full" /></p>
      <div className="grid gap-2 sm:grid-cols-3 mb-4">
        {[0, 1, 2].map((i) => <Sk key={i} className="h-[38px] !rounded-md" />)}
      </div>
      <PhotoCardSk n={8} />
    </>
  );
}

// My Media hub (photos/reels/credits tabs).
export function MyMediaSk() {
  return (
    <>
      <div className="mb-1 flex items-center gap-3">
        <div className={H1}><Sk className="h-8 w-48 !rounded-md" /></div>
      </div>
      <p className={SUB}><Sk className="h-3.5 w-72 max-w-full" /></p>
      <div className="flex gap-1 bg-card2 border border-line rounded p-1 w-fit mb-4">
        {[0, 1, 2].map((i) => <Sk key={i} className="h-8 w-24 !rounded-md" />)}
      </div>
      <PhotoCardSk n={8} />
    </>
  );
}

// My reels tab: 2-col video/status cards (player or status block + meta +
// status pills + download button).
export function ReelCardsSk({ n = 4 } = {}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line bg-card overflow-hidden">
          <Sk className="aspect-video !rounded-none" />
          <div className="p-3 space-y-2">
            <Sk className="h-3.5 w-3/4" />
            <Sk className="h-3 w-1/2" />
            <div className="flex gap-1.5">
              <Sk className="h-5 w-20 !rounded" />
              <Sk className="h-5 w-16 !rounded" />
            </div>
            <Sk className="h-10 w-full !rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

// My credits tab: 2-col bundle cards (big balance + segment bar + link).
export function CreditCardsSk({ n = 4 } = {}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: n }).map((_, i) => (
        <section key={i} className="rounded-lg border border-line bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Sk className="h-4 w-40" />
            <Sk className="h-7 w-20" />
          </div>
          <Sk className="h-3 w-32 mt-1" />
          <Sk className="h-2 w-full !rounded-full mt-3" />
          <div className="flex items-center gap-3 mt-3">
            <Sk className="h-9 w-44 !rounded-md" />
            <Sk className="h-3 w-24" />
          </div>
        </section>
      ))}
    </div>
  );
}

// Reels order page (event picker + product cards + short form).
export function ReelOrderSk() {
  return (
    <>
      <div className="mb-1 flex items-center gap-3">
        <div className={H1}><Sk className="h-8 w-64 max-w-full !rounded-md" /></div>
      </div>
      <p className={SUB}><Sk className="h-3.5 w-96 max-w-full" /></p>
      <Sk className="h-[38px] w-full !rounded-md mb-4" />
      <section className={CARD}>
        <Sk className="h-5 w-40" />
        <Sk className="h-3.5 w-3/4 mt-1.5" />
        <div className="grid gap-2 md:grid-cols-3 mt-3 mb-3">
          {[0, 1, 2].map((i) => <Sk key={i} className="h-24 !rounded-lg" />)}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-12 !rounded-md" />)}
        </div>
        <Sk className="h-10 w-48 !rounded-md mt-3" />
      </section>
    </>
  );
}

/* ---------------- admin skeletons ---------------- */

// Admin queue/correction cards (corrections, naming review): title + two
// text lines + action buttons.
export function AdminCardsSk({ n = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <section key={i} className={CARD}>
          <Sk className="h-5 w-2/3" />
          <Sk className="h-3.5 w-full mt-2" />
          <Sk className="h-3.5 w-4/5 mt-1.5" />
          <div className="flex flex-wrap gap-2 mt-3">
            <Sk className="h-9 w-28 !rounded-md" />
            <Sk className="h-9 w-28 !rounded-md" />
            <Sk className="h-9 w-24 !rounded-md" />
          </div>
        </section>
      ))}
    </div>
  );
}

// Admin settings-style form (scoring draft, rating weights): section title
// + label/field rows.
export function AdminFormSk({ rows = 5 }) {
  return (
    <section className={CARD}>
      <Sk className="h-5 w-52" />
      <Sk className="h-3.5 w-3/4 mt-1.5 mb-4" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 mb-3 last:mb-0">
          <div>
            <Sk className="h-2.5 w-28 mb-1.5" />
            <Sk className="h-9 w-56 !rounded-md" />
          </div>
          <div>
            <Sk className="h-2.5 w-20 mb-1.5" />
            <Sk className="h-9 w-36 !rounded-md" />
          </div>
        </div>
      ))}
      <Sk className="h-10 w-44 !rounded-md mt-4" />
    </section>
  );
}
