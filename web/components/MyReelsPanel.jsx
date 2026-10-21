'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { CARD, BTN_PRIMARY } from '../lib/tokens';
import ReelPlayer from './ReelPlayer';
import { ReelCardsSk } from './Skeletons';

const nzd = (c) => (c === null || c === undefined ? '—' : `NZ$${(Number(c) / 100).toFixed(2)}`);
const STATUS_HINT = {
  awaiting_payment: 'Waiting for payment — complete checkout to start production.',
  pending: 'Paid — queued for production.',
  in_production: 'Being filmed and edited — check back soon.',
  ready: 'Ready — your reel is finished.',
  delivered: 'Delivered — yours to keep.',
  cancelled: 'Cancelled.',
};

// Shared body for My reels (reels route + My Media tab).
export default function MyReelsPanel({ onCount }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`${API}/api/my/reels`, { credentials: 'include' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.status === 401) throw new Error('Log in to see your reels.');
        if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
        if (live) { setRows(j.data || []); if (onCount) onCount((j.data || []).length); }
      })
      .catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {err && <section className={CARD} role="alert"><p className="text-blood text-sm">{err}</p></section>}
      {rows === null && !err && <ReelCardsSk n={4} />}
      {rows !== null && !rows.length && !err && (
        <section className={CARD}>
          <div className="flex flex-col items-center py-10 text-center">
            <span className="text-4xl" aria-hidden="true">🎬</span>
            <h2 className="mt-3 text-[16px] font-bold text-white">No reel orders yet</h2>
            <p className="mt-1 text-[13px] text-muted">Order a custom reel — filmed and edited for you.</p>
            <Link href="/reels/order" className={`${BTN_PRIMARY} no-underline mt-4`}>Order a reel</Link>
          </div>
        </section>
      )}
      {!!rows?.length && (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((o) => (
            <article key={o.id} className="flex flex-col rounded-xl border border-line bg-card overflow-hidden">
              {(o.preview_url && ['ready', 'delivered'].includes(o.status)) ? (
                <ReelPlayer previewUrl={o.preview_url} posterUrl={o.thumb_url}
                  title={`${o.product_name} — ${o.horse_name}`} />
              ) : (
                <div className="flex items-center justify-center gap-2 bg-card2 py-10 text-muted text-[13px]">
                  <span className="text-2xl" aria-hidden="true">🎬</span>
                  {STATUS_HINT[o.status] || o.status}
                </div>
              )}
              <div className="flex grow flex-col gap-1 p-3">
                <div className="text-[13.5px] font-bold text-white truncate">
                  {o.product_name} — {o.horse_name}
                </div>
                <div className="text-[11.5px] text-faint truncate">
                  {[o.event_name, o.class_name, o.back_number && `#${o.back_number}`].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="rounded border border-line px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-muted">
                    {o.status.replace(/_/g, ' ')}
                  </span>
                  {o.showcase && (
                    <span className="rounded border border-gold/40 px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide text-gold">
                      showcase
                    </span>
                  )}
                  <span className="ml-auto text-[12px] font-bold text-muted tabular-nums">{nzd(o.price_cents)}</span>
                </div>
                {o.media_id && ['ready', 'delivered'].includes(o.status) && (
                  <a href={`${API}/api/media/${o.media_id}/download`}
                    className={`${BTN_PRIMARY} no-underline mt-1.5 text-center !py-2`}>
                    Download full file
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
