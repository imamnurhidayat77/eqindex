'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CARD, H1, SUB, LINK } from '../../../lib/tokens';

function Inner() {
  const sp = useSearchParams();
  const purchase = sp.get('purchase');
  return (
    <>
      <h1 className={H1}>Payment received</h1>
      <p className={SUB}>Your download link is on its way by email. Keep this reference: {purchase || '—'}.</p>
      <section className={CARD}>
        <p className="text-sm text-muted">Downloads unlock as soon as payment confirms (usually seconds).</p>
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
