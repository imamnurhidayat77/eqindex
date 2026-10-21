'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { API } from '../lib/api';
import { H1, badge, BADGE } from '../lib/tokens';
import { Pagination } from './list-controls';
import { EmptyState } from './EmptyState';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtD = (s) => {
  const d = parseDay(s);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtRange = (e) => {
  if (!e.date_start) return 'Date TBC';
  if (!e.date_end || e.date_end.slice(0, 10) === e.date_start.slice(0, 10)) return fmtD(e.date_start);
  return `${fmtD(e.date_start)} – ${fmtD(e.date_end)}`;
};
const hasData = (e) =>
  Number(e.class_count || 0) > 0 || Number(e.round_count || 0) > 0 || Number(e.combo_count || 0) > 0;
const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };

function statusOf(e, today) {
  const s = parseDay(e.date_start);
  const en = parseDay(e.date_end) || s;
  if (s && en && s <= today && today <= en) return 'live';
  if (s && s > today) return 'upcoming';
  if (hasData(e)) return 'results';
  return 'finished';
}
const STATUS_BADGE = {
  live: BADGE.red,
  upcoming: BADGE.blue,
  results: BADGE.green,
  finished: BADGE.gray,
};
const STATUS_LABEL = { live: 'Live now', upcoming: 'Upcoming', results: 'Results', finished: 'Finished' };

function CalendarGlyph({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18M8 3v3.5M16 3v3.5" />
    </svg>
  );
}

function Badges({ e, today }) {
  const st = statusOf(e, today);
  return (
    <span className={badge(STATUS_BADGE[st])}>
      {st === 'live' && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" aria-hidden="true" />}
      {STATUS_LABEL[st]}
    </span>
  );
}

const hrefOf = (e) => `/events/${e.slug || e.id}`;
const metaLine = (e) =>
  [e.venue || '—', e.region, e.season ? `Season ${e.season.replace('-', '/')}` : null].filter(Boolean).join(' · ');
const statLine = (e) =>
  [e.class_count ? `${e.class_count} classes` : null, (e.combo_count || e.round_count) ? `${e.combo_count ?? e.round_count} rounds` : null]
    .filter(Boolean).join(' · ');

function EventCard({ e, today }) {
  const stats = [
    e.class_count ? { v: String(e.class_count), l: 'classes' } : null,
    (e.combo_count || e.round_count) ? { v: String(e.combo_count ?? e.round_count), l: 'rounds' } : null,
  ].filter(Boolean);
  return (
    <article className="group flex h-full flex-col rounded-lg border border-line bg-ink p-5 transition-colors hover:border-gold/50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-gold">{fmtRange(e)}</span>
        <Badges e={e} today={today} />
      </div>
      <Link href={hrefOf(e)} aria-label={`${e.name} — view details`} className="mt-2.5 block font-extrabold text-[16px] leading-[1.25] text-white no-underline hover:text-gold line-clamp-2 transition-colors">
        {e.name}
      </Link>
      <div className="mt-1 truncate text-[12.5px] text-muted">{metaLine(e)}</div>
      {!!stats.length && (
        <div className="mt-3 flex gap-6 rounded-md bg-card px-3.5 py-2.5">
          {stats.map((s) => (
            <span key={s.l}>
              <span className="block text-[16px] font-extrabold leading-none tabular-nums text-white">{s.v}</span>
              <span className="mt-1 block text-[10.5px] uppercase tracking-[0.6px] text-faint">{s.l}</span>
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto pt-3">
        <Link href={hrefOf(e)} className="text-[13px] font-bold text-gold no-underline hover:brightness-110">View details <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span></Link>
      </div>
    </article>
  );
}

function EventRow({ e, today }) {
  return (
    <article className="group flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-2 py-3.5 last:border-0 transition-colors hover:bg-white/[0.02]">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link href={hrefOf(e)} className="font-bold text-[14px] text-white no-underline hover:text-gold">{e.name}</Link>
          <Badges e={e} today={today} />
        </div>
        <div className="mt-1 text-[12.5px] text-muted">
          {fmtRange(e)}{e.venue ? ` · ${e.venue}` : ''}{e.region ? `, ${e.region}` : ''}
          {statLine(e) ? ` · ${statLine(e)}` : ''}
        </div>
      </div>
      <Link href={hrefOf(e)} aria-label={`${e.name} — view details`} className="shrink-0 text-[13px] font-bold text-gold no-underline hover:brightness-110">View details <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span></Link>
    </article>
  );
}

function monthCells(y, m) {
  // Weeks start Monday. Returns 6x7 grid of Dates (leading/trailing dimmed).
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(y, m, 1 - lead);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function EventViews() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('cards'); // cards | list | calendar
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(9);
  const [ym, setYm] = useState(() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() }; });
  const [sel, setSel] = useState(null); // selected day ISO (calendar)
  const today = useMemo(startOfToday, []);

  useEffect(() => {
    fetch(`${API}/events?limit=200&include_empty=1`)
      .then((r) => r.json())
      .then((j) => setRows(j.data || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    // Home shows only events that already have results (like before).
    const scoped = rows.filter((x) => hasData(x));
    const s = q.trim().toLowerCase();
    const hit = s ? scoped.filter((x) =>
      (x.name || '').toLowerCase().includes(s) ||
      (x.venue || '').toLowerCase().includes(s) ||
      (x.region || '').toLowerCase().includes(s)) : scoped;
    return [...hit].sort((a, b) => String(b.date_start || '').localeCompare(String(a.date_start || '')));
  }, [rows, q]);

  // Calendar index: day ISO -> events (multi-day spans counted each day, capped).
  const byDay = useMemo(() => {
    const map = {};
    for (const e of filtered) {
      const s = parseDay(e.date_start);
      if (!s) continue;
      const en = parseDay(e.date_end) || s;
      const days = Math.min(366, Math.max(0, Math.round((en - s) / 864e5)));
      for (let i = 0; i <= days; i++) {
        const d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
        const k = dayKey(d);
        (map[k] ||= []).push(e);
      }
    }
    return map;
  }, [filtered]);

  const cells = useMemo(() => monthCells(ym.y, ym.m), [ym]);
  const autoDay = useMemo(() => {
    const inMonth = cells.filter((d) => d.getMonth() === ym.m);
    const tIso = dayKey(today);
    if (inMonth.some((d) => dayKey(d) === tIso) && byDay[tIso]?.length) return tIso;
    const first = inMonth.map(dayKey).find((k) => byDay[k]?.length);
    return first || null;
  }, [cells, ym.m, byDay, today]);
  const activeDay = sel && byDay[sel] && parseDay(sel)?.getMonth?.() !== undefined
    && cells.some((d) => dayKey(d) === sel) ? sel : autoDay;
  const dayEvents = activeDay ? (byDay[activeDay] || []) : [];

  const resetPage = () => setPage(1);
  const switchMode = (m) => { setMode(m); setPage(1); setPerPage(m === 'cards' ? 9 : 10); };

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const view = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const segBtn = (active) =>
    `flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold no-underline border-0 cursor-pointer transition-colors ${
      active ? 'bg-card2 text-gold' : 'bg-transparent text-muted hover:text-white'}`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={H1}>Events</h1>
        </div>
        <div className="flex overflow-hidden rounded-md border border-line bg-card" role="tablist" aria-label="View mode">
          {[['cards', '▦', 'Cards'], ['list', '☰', 'List'], ['calendar', '▤', 'Calendar']].map(([v, icon, lbl]) => (
            <button key={v} role="tab" aria-selected={mode === v} onClick={() => switchMode(v)} className={segBtn(mode === v)}>
              <span aria-hidden="true">{icon}</span>{lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 mb-4">
        <input value={q} onChange={(e) => { setQ(e.target.value); resetPage(); }}
          placeholder="Search events, venues, regions…"
          aria-label="Search events"
          className="w-full min-w-[220px] rounded-md border border-line bg-ink px-3.5 py-2.5 text-[14px] text-white placeholder:text-faint focus:border-gold/60 focus:outline-none" />
      </div>

      {mode === 'calendar' ? (
        <section className="rounded-lg border border-line bg-card px-5 py-[18px] mb-6">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => { setYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })); setSel(null); }}
              aria-label="Previous month"
              className="h-9 w-9 rounded-md border border-line bg-card2 text-body hover:text-gold hover:border-gold/50 transition-colors">←</button>
            <div className="font-display text-[17px] font-bold">{MONTHS[ym.m]} {ym.y}</div>
            <button onClick={() => { setYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })); setSel(null); }}
              aria-label="Next month"
              className="h-9 w-9 rounded-md border border-line bg-card2 text-body hover:text-gold hover:border-gold/50 transition-colors">→</button>
          </div>
          <div className="grid grid-cols-7 overflow-hidden rounded-md border border-line">
            {WDAYS.map((w) => (
              <div key={w} className="border-b border-line bg-card2 px-2 py-2 text-center text-[11px] font-bold tracking-wide text-muted">{w}</div>
            ))}
            {cells.map((d) => {
              const k = dayKey(d);
              const n = (byDay[k] || []).length;
              const inMonth = d.getMonth() === ym.m;
              const isToday = k === dayKey(today);
              const isSel = k === activeDay;
              return (
                <button key={k} onClick={() => setSel(k)} disabled={!inMonth && !n}
                  className={`min-h-[64px] border-b border-r border-line/60 px-2 py-1.5 text-left align-top transition-colors last:border-r-0
                    ${inMonth ? 'bg-ink hover:bg-card2' : 'bg-card text-faint'}
                    ${isSel ? 'outline outline-2 outline-gold -outline-offset-2 bg-goldbg/10' : ''}`}>
                  <span className={`text-[12.5px] tabular-nums ${isToday ? 'font-extrabold text-gold' : inMonth ? 'text-body' : 'text-faint'}`}>{d.getDate()}</span>
                  {n > 0 && (
                    <span className="mt-1 block w-fit rounded-full bg-gold px-1.5 py-px text-[11px] font-extrabold tabular-nums text-black">{n}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-5 border-t border-line pt-3">
            <div className="mb-2 text-[14px] font-bold text-white">
              {activeDay ? `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseDay(activeDay).getDay()]} ${fmtD(activeDay)}` : 'Select a day'}
            </div>
            {dayEvents.length ? dayEvents.map((e) => <EventRow key={e.id} e={e} today={today} />) : (
              <EmptyState icon={<CalendarGlyph />} title={loading ? 'Loading events…' : 'No events this day'} hint="Pick a highlighted date to see its events." />
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-line bg-card px-5 py-[18px] mb-6">
          {loading ? (
            <div className="flex flex-col gap-2 py-2" aria-label="Loading">
              {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="sk h-14 w-full" />)}
            </div>
          ) : view.length ? (
            mode === 'cards' ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {view.map((e, i) => (
                  <div key={e.id} className="rise flex flex-col" style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}>
                    <EventCard e={e} today={today} />
                  </div>
                ))}
              </div>
            ) : (
              <div>{view.map((e) => <EventRow key={e.id} e={e} today={today} />)}</div>
            )
          ) : (
            <EmptyState icon={<CalendarGlyph />} title="No events match your search" hint="Try a different event, venue or region — or clear the search." />
          )}
          <Pagination page={safePage} pages={pages} setPage={setPage} perPage={perPage} setPerPage={setPerPage}
            total={filtered.length} perPageOptions={mode === 'cards' ? [9, 18, 36] : [10, 25, 50]} />
        </section>
      )}
    </>
  );
}
