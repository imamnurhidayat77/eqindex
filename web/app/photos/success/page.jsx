'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, LINK } from '../../../lib/tokens';

function Inner() {
  const sp = useSearchParams();
  const purchase = sp.get('purchase');
  const [state, setState] = useState('checking');

  useEffect(() => {
    if (!purchase) { setState('unknown'); return; }
    let live = true;
    const check = async () => {
      try {
        const r = await fetch(`${API}/api/purchases/${purchase}`, { credentials: 'include' });
        if (r.status === 401) { if (live) setState('login'); return; }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { if (live) setState('unknown'); return; }
        if (j.data?.status === 'paid') { if (live) setState('paid'); return true; }
        return false;
      } catch { return false; }
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

  return (
    <>
      <h1 className={H1}>{state === 'paid' ? 'Payment received' : state === 'login' ? 'One more step' : 'Confirming payment…'}</h1>
      <p className={SUB}>
        {state === 'paid' ? 'Your download is unlocked below.'
          : state === 'login' ? 'Log in to link this purchase to your account, then reopen this page.'
          : state === 'unknown' ? 'We could not find that purchase. Check your email receipt for the correct link.'
          : 'Waiting for payment confirmation (usually seconds) — no need to refresh.'}
      </p>
      <section className={CARD}>
        {state === 'paid' && (
          <Link href="/photos/library" className={LINK}>Go to my photos →</Link>
        )}
        {state !== 'paid' && state !== 'unknown' && (
          <p className="text-sm text-muted">Reference: {purchase || '—'}</p>
        )}
        <div className="flex gap-4 mt-3">
          <Link href="/photos/library" className={LINK}>My photos →</Link>
          <Link href="/photos" className={LINK}>Back to gallery →</Link>
        </div>
      </section>
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
