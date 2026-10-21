'use client';
import Link from 'next/link';
import { useState } from 'react';
import { H1, SUB } from '../../lib/tokens';
import { useAuth } from '../../components/auth';
import MyCreditsPanel from '../../components/MyCreditsPanel';
import { CreditCardsSk } from '../../components/Skeletons';

export default function MyCredits() {
  const { user, loading } = useAuth();
  const [total, setTotal] = useState(null);
  if (loading) return (
    <>
      <div className="mb-1"><div className={H1}><span className="sk h-8 w-44 !rounded-md" aria-hidden="true" /></div></div>
      <CreditCardsSk n={4} />
    </>
  );
  if (!user) return (
    <>
      <h1 className={H1}>My credits</h1>
      <p className={SUB}>Log in to see your credits.</p>
      <Link href="/login" className="text-sky text-[13px] no-underline hover:underline">Log in →</Link>
    </>
  );
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={H1}>My credits</h1>
        {!!total && (
          <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-bold text-muted">
            {total} left
          </span>
        )}
        <span className="flex-1" />
        <Link href="/media" className="text-sky text-[13px] no-underline hover:underline">My media →</Link>
      </div>
      <p className={SUB}>5-pack bundles, per event × rider/horse. Open a photo in scope and unlock it with one click.</p>
      <MyCreditsPanel onTotal={setTotal} />
    </>
  );
}
