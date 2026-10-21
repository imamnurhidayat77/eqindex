'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { H1, SUB } from '../../lib/tokens';
import { useAuth } from '../../components/auth';
import MyPhotosPanel from '../../components/MyPhotosPanel';
import MyReelsPanel from '../../components/MyReelsPanel';
import MyCreditsPanel from '../../components/MyCreditsPanel';
import { MyMediaSk } from '../../components/Skeletons';

const TABS = [['photos', 'Photos'], ['reels', 'Reels'], ['credits', 'Credits']];

// My Media: one buyer hub — owned photos, reel orders, credit bundles —
// with the credit balance always visible on top.
export default function MyMedia() {
  return (
    <Suspense>
      <MyMediaInner />
    </Suspense>
  );
}

function MyMediaInner() {
  const { user, loading } = useAuth();
  const sp = useSearchParams();
  const initial = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'photos';
  const [tab, setTab] = useState(initial);
  const [photoCount, setPhotoCount] = useState(null);
  const [reelCount, setReelCount] = useState(null);
  const [creditTotal, setCreditTotal] = useState(null);

  if (loading) return <MyMediaSk />;
  if (!user) return (
    <>
      <h1 className={H1}>My media</h1>
      <p className={SUB}>Log in to see everything you own — photos, reels and credits.</p>
      <Link href="/login" className="text-sky text-[13px] no-underline hover:underline">Log in →</Link>
    </>
  );
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={H1}>My media</h1>
        {Number(creditTotal) > 0 && (
          <Link href="/media?tab=credits" onClick={() => setTab('credits')}
            className="rounded-full border border-gold/50 bg-goldbg/20 px-2.5 py-1 text-[12px] font-bold text-gold no-underline hover:brightness-110">
            {creditTotal} credit{Number(creditTotal) === 1 ? '' : 's'} left
          </Link>
        )}
        <span className="flex-1" />
        <Link href="/photos" className="text-sky text-[13px] no-underline hover:underline">Buy more →</Link>
      </div>
      <p className={SUB}>Everything you own in one place.</p>

      <div className="flex gap-1 bg-card2 border border-line rounded p-1 w-fit mb-4" role="tablist" aria-label="My media">
        {TABS.map(([k, lbl]) => {
          const n = k === 'photos' ? photoCount : k === 'reels' ? reelCount : null;
          return (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`px-3.5 py-[7px] rounded-md text-[13px] whitespace-nowrap cursor-pointer border-0 ${tab === k ? 'bg-card text-gold font-bold' : 'bg-transparent text-muted hover:text-white'}`}>
              {lbl}{Number(n) > 0 ? ` (${n})` : ''}
            </button>
          );
        })}
      </div>

      {tab === 'photos' && <MyPhotosPanel onCount={setPhotoCount} />}
      {tab === 'reels' && <MyReelsPanel onCount={setReelCount} />}
      {tab === 'credits' && <MyCreditsPanel onTotal={setCreditTotal} />}
    </>
  );
}
