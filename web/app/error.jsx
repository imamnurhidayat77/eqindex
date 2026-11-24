'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { BTN, BTN_PRIMARY } from '../lib/tokens';

// Catches any server or client error below the root layout, so the header,
// search and footer stay usable. Most common cause: the API is unreachable.
export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section role="alert" className="mx-auto flex max-w-[520px] flex-col items-center px-4 py-16 text-center">
      <span aria-hidden="true" className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-line bg-card2 text-2xl text-gold/80">!</span>
      <h1 className="mt-4 font-display text-[22px] font-bold uppercase tracking-tight text-white">We couldn&apos;t load this page</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        The results service didn&apos;t answer in time or returned an error. Nothing you did caused this.
        Try again in a moment.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => reset()} className={BTN_PRIMARY}>Try again</button>
        <Link href="/" className={`${BTN} no-underline`}>Go to home</Link>
      </div>
      {error?.digest && <p className="mt-6 text-[12px] text-muted">Reference: <code>{error.digest}</code></p>}
    </section>
  );
}
