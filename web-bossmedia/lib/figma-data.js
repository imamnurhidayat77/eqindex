// Shared data adapters: real backend shapes -> Figma card shapes.
import { getJSON } from './api';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtDateRange(e) {
  const s = e.date_start ? new Date(e.date_start) : null;
  const en = e.date_end ? new Date(e.date_end) : s;
  if (!s || Number.isNaN(s.getTime())) return 'Date TBC';
  const f = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (!en || en.toDateString() === s.toDateString()) return f(s);
  if (en.getMonth() === s.getMonth() && en.getFullYear() === s.getFullYear()) {
    return `${s.getDate()}–${en.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
  }
  return `${f(s)} – ${f(en)}`;
}

export function eventYear(e) {
  const d = e.date_start ? new Date(e.date_start) : null;
  return d && !Number.isNaN(d.getTime()) ? String(d.getFullYear()) : '—';
}

// Honest status mapping from real data: past events have galleries,
// upcoming ones are pre-bookable. Live dot when today is inside the range.
export function eventStatus(e, now = Date.now()) {
  const s = e.date_start ? new Date(e.date_start).getTime() : NaN;
  const en = e.date_end ? new Date(e.date_end).getTime() : s;
  if (Number.isNaN(s)) return { status: 'Gallery live', live: false };
  if (s <= now && now <= en) return { status: 'Gallery live', live: true };
  if (s > now) return { status: 'Pre-book open', live: false };
  return { status: 'Gallery live', live: false };
}

export function toCardItem(e, i = 0) {
  const { status, live } = eventStatus(e);
  return {
    id: e.id,
    slug: e.slug || e.id,
    name: e.name,
    dateStart: e.date_start || null,
    dateEnd: e.date_end || null,
    location: [e.venue, e.region].filter(Boolean).join(', ') || 'New Zealand',
    venue: e.venue || '—',
    region: e.region || '',
    tier: e.tier || '',
    dateLine: fmtDateRange(e),
    year: eventYear(e),
    status,
    live,
    actionLabel: status === 'Gallery live' ? 'View gallery' : 'Pre-book',
    countLine: [
      e.class_count ? `${e.class_count} classes` : null,
      (e.combo_count || e.round_count) ? `${e.combo_count ?? e.round_count} rounds` : null,
    ].filter(Boolean).join(' · ') || null,
  };
}

export async function coverFor(eventId) {
  try {
    const j = await getJSON(`/photos?event_id=${eventId}&limit=1`).catch(() => ({ data: [] }));
    const c = (j.data || [])[0];
    return c?.thumb_url || c?.preview_url || null;
  } catch { return null; }
}

export async function eventsWithCovers(limit = 12, { withCovers = true } = {}) {
  const { data } = await getJSON(`/events?limit=${limit}`).catch(() => ({ data: [] }));
  const rows = data || [];
  if (!withCovers) return rows.map((e, i) => ({ ...toCardItem(e, i), cover: null }));
  const out = await Promise.all(rows.map(async (e, i) => ({ ...toCardItem(e, i), cover: await coverFor(e.id) })));
  return out;
}

export const nzd = (cents) => `NZ$${(Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, '')}`;

// Stripe return override so buyers land back on THIS storefront after
// paying (backend defaults to the EQIndex APP_URL). Backend validates the
// origin against its allowlist; unknown origins fall back to the default.
export const checkoutBase = () => ({ return_base: window.location.origin });

// Gallery truth, shared by home + archive: events that actually have
// published photos, with cover. Photo-only shells have no classes/rounds,
// which /events hides by default — hence include_empty=1.
export async function galleryEvents() {
  const [{ data: events }, { data: photoEvents }] = await Promise.all([
    getJSON('/events?limit=200&include_empty=1').catch(() => ({ data: [] })),
    getJSON('/photos/events').catch(() => ({ data: [] })),
  ]);
  const coverByEvent = new Map();
  for (const r of photoEvents || []) {
    if (r.event_id && !coverByEvent.has(r.event_id)) {
      coverByEvent.set(r.event_id, r.thumb_url || r.preview_url || null);
    }
  }
  return (events || [])
    .filter((e) => coverByEvent.has(e.id))
    .map((e, i) => ({ ...toCardItem(e, i), cover: coverByEvent.get(e.id) }));
}
