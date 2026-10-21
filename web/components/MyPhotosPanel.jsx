'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { CARD, BTN_PRIMARY } from '../lib/tokens';

const nzd = (c) => (c === null || c === undefined ? '—' : `NZ$${(Number(c) / 100).toFixed(2)}`);
const fmtDate = (d) => (d || '').slice(0, 10);

function ImageIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3 17l5-4 4 3 4-4 5 5" />
    </svg>
  );
}

// Shared body for My photos (library route + My Media tab).
// onCount(rows.length) lets the host page show the badge in its header.
export default function MyPhotosPanel({ onCount }) {
  const [rows, setRows] = useState(null);
  const [claimed, setClaimed] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setBusy(true); setErr('');
    (async () => {
      try {
        const [a, b] = await Promise.all([
          fetch(`${API}/api/my/photos`, { credentials: 'include' }).then((r) => r.json().then((j) => ({ r, j }))),
          fetch(`${API}/api/my/claimed`, { credentials: 'include' }).then((r) => r.json().then((j) => ({ r, j }))).catch(() => null),
        ]);
        if (!live) return;
        if (a.r.status === 401) throw new Error('Log in to see your photos.');
        if (!a.r.ok) throw new Error(a.j.error || `Failed (${a.r.status})`);
        setRows(a.j.data || []);
        setClaimed(b && b.r.ok ? b.j.data || [] : []);
        if (onCount) onCount((a.j.data || []).length);
      } catch (e) { if (live) setErr(e.message); }
      if (live) setBusy(false);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dl = (id) => `${API}/api/media/${id}/download`;

  return (
    <>
      {err && <section className={CARD} role="alert"><p className="text-blood text-sm">{err}</p></section>}
      {rows === null && !err && (
        <p className="text-muted text-sm mb-3">{busy ? 'Loading…' : ''}</p>
      )}
      {rows !== null && !rows.length && !err && (
        <section className={CARD}>
          <div className="flex flex-col items-center py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-card2 text-faint">
              <ImageIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-3 text-[16px] font-bold text-white">No purchases yet</h2>
            <p className="mt-1 text-[13px] text-muted">Bought photos appear here with lifetime re-downloads.</p>
            <Link href="/photos" className={`${BTN_PRIMARY} no-underline mt-4`}>Browse the gallery</Link>
          </div>
        </section>
      )}
      {!!rows?.length && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((x) => (
            <article key={`${x.purchase_id}-${x.media_id}`} className="flex flex-col rounded-xl border border-line bg-card overflow-hidden">
              <div className="aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  : <ImageIcon className="h-8 w-8 text-faint" />}
              </div>
              <div className="flex grow flex-col gap-1 p-3">
                <div className="text-[13.5px] font-bold text-white truncate">
                  {[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Photo'}
                </div>
                <div className="text-[11.5px] text-faint truncate">{x.event_name || ''}</div>
                <div className="flex items-center gap-1.5">
                  {x.license_tier && (
                    <span className="rounded border border-gold/40 px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-gold">
                      {x.license_tier}
                    </span>
                  )}
                  <span className="ml-auto text-[12px] font-bold text-muted tabular-nums">{nzd(x.amount_cents)}</span>
                </div>
                <a href={dl(x.media_id)}
                  className={`${BTN_PRIMARY} no-underline mt-1.5 text-center !py-2`}>
                  Download full-res
                </a>
                <div className="text-[10.5px] text-faint">Purchased {fmtDate(x.created_at)} · yours forever</div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!!claimed.length && (
        <>
          <h2 className="mt-7 mb-1 text-[15px] font-bold text-white">Claimed by you</h2>
          <p className="text-[12.5px] text-muted !mt-0 mb-3">Photos you saved as yourself — buy them to unlock full resolution.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {claimed.map((x) => (
              <Link key={x.id} href={`/photos/${x.id}`}
                className="flex flex-col rounded-xl border border-sky/40 bg-card overflow-hidden no-underline hover:border-gold/50 transition">
                <div className="aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                  {x.thumb_url || x.preview_url
                    ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    : <ImageIcon className="h-8 w-8 text-faint" />}
                </div>
                <div className="flex grow flex-col gap-1 p-3">
                  <div className="text-[13.5px] font-bold text-white truncate">
                    {[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Photo'}
                  </div>
                  <div className="text-[11.5px] text-faint truncate">
                    Saved as {x.claimed_horse || x.claimed_rider || 'you'} · {fmtDate(x.created_at)}
                  </div>
                  <span className="text-sky text-[12.5px] font-bold">Buy to unlock →</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
