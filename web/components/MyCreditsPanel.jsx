'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { CARD, BTN_PRIMARY } from '../lib/tokens';
import { CreditCardsSk } from './Skeletons';

// Shared body for My credits (credits route + My Media tab).
// onTotal(totalLeft) lets the host show the balance in its header.
export default function MyCreditsPanel({ onTotal }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/my/credits`, { credentials: 'include' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.status === 401) throw new Error('Log in to see your credits.');
        if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
        if (live) {
          setRows(j.data || []);
          if (onTotal) onTotal((j.data || []).reduce((s, b) => s + Number(b.slots_left || 0), 0));
        }
      })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const galleryHref = (b) => {
    const p = new URLSearchParams();
    if (b.event_id) p.set('event', b.event_id);
    if (b.horse_id) p.set('horse', b.horse_id);
    else if (b.rider_id) p.set('rider', b.rider_id);
    return `/photos?${p}`;
  };

  return (
    <>
      {err && <section className={CARD} role="alert"><p className="text-blood text-sm">{err}</p></section>}
      {rows === null && !err && <CreditCardsSk n={4} />}
      {rows !== null && !rows.length && !err && (
        <section className={CARD}>
          <div className="flex flex-col items-center py-10 text-center">
            <span className="text-4xl" aria-hidden="true">🎟️</span>
            <h2 className="mt-3 text-[16px] font-bold text-white">No credits yet</h2>
            <p className="mt-1 text-[13px] text-muted">Grab a 5-pack from any stable group in your watchlist, or any photo page.</p>
            <Link href="/watchlist" className={`${BTN_PRIMARY} no-underline mt-4`}>Go to watchlist</Link>
          </div>
        </section>
      )}
      {!!rows?.length && (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((b) => {
            const total = Number(b.slots_total) || 0;
            const left = Number(b.slots_left) || 0;
            const used = total - left;
            return (
              <section key={b.id} className="rounded-lg border border-line bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[14px] font-bold text-white truncate">
                    {[b.horse, b.rider].filter(Boolean).join(' × ') || 'Bundle'}
                  </div>
                  <div className="shrink-0 text-[22px] font-extrabold tabular-nums text-gold">
                    {left}<span className="text-[13px] font-bold text-faint">/{total} left</span>
                  </div>
                </div>
                <div className="text-[12px] text-faint truncate">{b.event_name || ''}</div>
                <div className="mt-2 flex gap-1" aria-label={`${used} of ${total} used`}>
                  {Array.from({ length: total }).map((_, i) => (
                    <span key={i} title={i < used ? 'Used' : 'Available'}
                      className={`h-2 flex-1 rounded-full ${i < used ? 'bg-line' : 'bg-gold'}`} />
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Link href={galleryHref(b)} className={`${BTN_PRIMARY} no-underline !py-2 text-[13px]`}>
                    Browse photos to unlock →
                  </Link>
                  <span className="text-[11.5px] text-faint">Bought {String(b.created_at || '').slice(0, 10) || ''}</span>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
