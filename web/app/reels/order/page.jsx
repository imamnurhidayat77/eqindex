'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API } from '../../../lib/api';
import { H1, SUB } from '../../../lib/tokens';
import ReelOrderForm from '../../../components/ReelOrderForm';
import Dropdown from '../../../components/Dropdown';

// Standalone Video Reels order page (top-level "Reels" menu).
// Pick the event first (per-event pricing), then the existing order form
// takes over. Deep-linkable: /reels/order?event=<id or slug>.
function OrderInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const wanted = sp.get('event') || '';
  const [events, setEvents] = useState(null);
  const [sel, setSel] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      let list = [];
      try {
        const r = await fetch(`${API}/events?limit=200&include_empty=1`);
        const j = await r.json().catch(() => ({}));
        list = Array.isArray(j.data) ? j.data : [];
      } catch { list = []; }
      // ?event= may point at an event outside the list window (or a slug):
      // resolve it directly so the deep link still works.
      if (wanted && !list.some((e) => String(e.id) === wanted || (e.slug && String(e.slug) === wanted))) {
        try {
          const r2 = await fetch(`${API}/events/${encodeURIComponent(wanted)}`);
          const j2 = await r2.json().catch(() => ({}));
          if (r2.ok && j2.data?.id) list = [j2.data, ...list];
        } catch { /* fall through to list matching */ }
      }
      if (!alive) return;
      setEvents(list);
      const hit = wanted && list.find((e) => String(e.id) === wanted || (e.slug && String(e.slug) === wanted));
      if (hit) { setSel(hit.id); return; }
      // Default: nearest upcoming event, else the most recent one.
      const now = Date.now();
      const upcoming = list
        .filter((e) => e.date_start && new Date(e.date_start).getTime() >= now - 864e5)
        .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
      setSel((upcoming[0] || list[0])?.id || '');
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    const now = Date.now();
    const up = [], past = [];
    for (const e of events || []) {
      const t = e.date_start ? new Date(e.date_start).getTime() : NaN;
      if (!Number.isNaN(t) && t >= now - 864e5) up.push(e);
      else past.push(e);
    }
    up.sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
    past.sort((a, b) => String(b.date_start || '').localeCompare(String(a.date_start || '')));
    return [...up, ...past];
  }, [events]);

  const options = useMemo(() => sorted.map((e) => ({
    value: e.id,
    label: `${e.name}${e.date_start ? ` · ${String(e.date_start).slice(0, 10)}` : ''}`,
  })), [sorted]);

  const current = (events || []).find((e) => String(e.id) === String(sel));

  const pick = (o) => {
    setSel(o.value);
    const ev = (events || []).find((e) => String(e.id) === String(o.value));
    router.replace(`/reels/order?event=${encodeURIComponent(ev?.slug || ev?.id || o.value)}`);
  };

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={H1}>Order a video reel</h1>
        <span className="flex-1" />
        <Link href="/reels" className="text-sky no-underline hover:underline text-[13px]">My reels →</Link>
      </div>
      <p className={SUB}>Custom reels filmed and edited for you — pay up front, we produce after.</p>

      <div className="mb-4 flex flex-col gap-1.5">
        <span className="text-[11px] uppercase tracking-wide text-faint font-bold">Event</span>
        <Dropdown
          ariaLabel="Pick event"
          value={sel}
          options={options}
          onSelect={pick}
          placeholder={events === null ? 'Loading events…' : 'Pick an event…'}
          searchable
          block
        />
        {events !== null && !events.length && (
          <span className="text-[12px] text-faint">No events found — showing global reel prices.</span>
        )}
      </div>

      <ReelOrderForm
        key={sel || 'global'}
        eventId={sel || undefined}
        eventName={current?.name || ''}
      />
    </>
  );
}

export default function ReelOrderPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">Loading…</p>}>
      <OrderInner />
    </Suspense>
  );
}
