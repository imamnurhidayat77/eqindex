'use client';
import Link from 'next/link';
import { useState } from 'react';
import { H1, SUB, BTN_PRIMARY } from '../../lib/tokens';
import { useAuth } from '../../components/auth';
import MyReelsPanel from '../../components/MyReelsPanel';

export default function MyReels() {
  const { user, loading } = useAuth();
  const [count, setCount] = useState(null);
  if (loading) return <p className="text-muted text-sm">Loading…</p>;
  if (!user) return (
    <>
      <h1 className={H1}>My reels</h1>
      <p className={SUB}>Log in to see your reels.</p>
      <Link href="/login" className={`${BTN_PRIMARY} no-underline mt-4 inline-block`}>Log in</Link>
    </>
  );
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={H1}>My reels</h1>
        {!!count && (
          <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-bold text-muted">
            {count} order{count > 1 ? 's' : ''}
          </span>
        )}
        <span className="flex-1" />
        <Link href="/media" className="text-sky text-[13px] no-underline hover:underline">My media →</Link>
      </div>
      <p className={SUB}>Custom reels you ordered — private to you unless you allowed showcase.</p>
      <MyReelsPanel onCount={setCount} />
    </>
  );
}
