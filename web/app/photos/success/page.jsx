'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, BTN_PRIMARY } from '../../../lib/tokens';

const nzd = (c) => (c === null || c === undefined ? '—' : `NZ$${(Number(c) / 100).toFixed(2)}`);
const fmtDate = (d) => (d || '').slice(0, 10);

function CheckIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8 12.5l2.6 2.6L16.5 9" />
    </svg>
  );
}

function Spinner({ className }) {
  return (
    <span aria-hidden="true" className={`inline-block h-8 w-8 animate-spin rounded-full border-2 border-line border-t-gold ${className || ''}`} />
  );
}

function Inner() {
  const sp = useSearchParams();
  const purchase = sp.get('purchase');
  const [state, setState] = useState('checking');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!purchase) { setState('unknown'); return; }
    let live = true;
    const check = async () => {
      try {
        const r = await fetch(`${API}/api/purchases/${purchase}`, { credentials: 'include' });
        if (r.status === 401) { if (live) setState('login'); return; }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { if (live) setState('unknown'); return; }
        if (j.data?.status === 'paid') {
          if (live) { setDetail(j.data); setState('paid'); }
          return true;
        }
      } catch { /* retry below */ }
      return false;
    };
    check().then((done) => {
      if (done || !live) return;
      const t = setInterval(async () => {
        if (await check()) clearInterval(t);
      }, 4000);
      setTimeout(() => clearInterval(t), 60000);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase]);

  const title = detail
    ? [detail.horse, detail.rider].filter(Boolean).join(' × ') || detail.event_name || 'Photo'
    : 'Photo';

  return (
    <>
      {state === 'paid' ? (
        <>
          <div className="mx-auto max-w-[560px] text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-goldbg/40 text-gold">
              <CheckIcon className="h-9 w-9" />
            </span>
            <h1 className={`${H1} mt-4`}>Payment successful</h1>
            <p className={SUB}>Your full-resolution file is unlocked below — re-downloadable any time from My photos.</p>
          </div>
          <section className={`${CARD} mx-auto max-w-[560px]`}>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-faint font-bold">Order summary</div>
            <dl className="text-[13.5px]">
              {[
                ['Item', title],
                ['License', detail.license_tier || '—'],
                ['Paid', `${nzd(detail.amount_cents)}${detail.created_at ? ` · ${fmtDate(detail.created_at)}` : ''}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-rowline last:border-0 py-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-semibold text-right">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 grid gap-2">
              {detail.media_id && (
                <a href={`${API}/api/media/${detail.media_id}/download`} className={`${BTN_PRIMARY} no-underline text-center`}>
                  Download full-res now
                </a>
              )}
              <div className="flex gap-3 justify-center">
                <Link href="/photos/library" className="text-sky text-sm no-underline hover:underline">My photos →</Link>
                <Link href="/photos" className="text-sky text-sm no-underline hover:underline">Back to gallery →</Link>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <h1 className={H1}>{state === 'login' ? 'One more step' : state === 'unknown' ? 'Order not found' : 'Confirming payment…'}</h1>
          <p className={SUB}>
            {state === 'login' ? 'Log in to link this purchase to your account, then reopen this page.'
              : state === 'unknown' ? 'We could not find that purchase. Check your email receipt for the correct link.'
              : 'Waiting for payment confirmation (usually seconds) — no need to refresh.'}
          </p>
          <section className={CARD}>
            {state !== 'unknown' && state !== 'login' && (
              <div className="flex items-center gap-3 py-2">
                <Spinner />
                <span className="text-[13px] text-muted">Reference: {purchase || '—'}</span>
              </div>
            )}
            <div className="flex gap-4 mt-1">
              <Link href="/photos/library" className="text-sky text-sm no-underline hover:underline">My photos →</Link>
              <Link href="/photos" className="text-sky text-sm no-underline hover:underline">Back to gallery →</Link>
            </div>
          </section>
        </>
      )}
    </>
  );
}

export default function PhotoSuccess() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
