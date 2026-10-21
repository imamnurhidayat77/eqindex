'use client';
import Link from 'next/link';
import { useState } from 'react';
import { H1, SUB, BTN_PRIMARY } from '../../../lib/tokens';
import { useAuth } from '../../../components/auth';
import MyPhotosPanel from '../../../components/MyPhotosPanel';
import { PhotoCardSk } from '../../../components/Skeletons';

export default function PhotoLibrary() {
  const { user, loading } = useAuth();
  const [count, setCount] = useState(null);
  if (loading) return (
    <>
      <div className="mb-1"><h1 className={H1}>My photos</h1></div>
      <PhotoCardSk n={8} />
    </>
  );
  if (!user) return (
    <>
      <h1 className={H1}>My photos</h1>
      <p className={SUB}>Log in to see your photos.</p>
      <Link href="/login" className={`${BTN_PRIMARY} no-underline mt-4 inline-block`}>Log in</Link>
    </>
  );
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className={H1}>My photos</h1>
        {!!count && (
          <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-bold text-muted">
            {count} photo{count > 1 ? 's' : ''}
          </span>
        )}
        <span className="flex-1" />
        <Link href="/media" className="text-sky text-[13px] no-underline hover:underline">My media →</Link>
        <Link href="/photos" className={`${BTN_PRIMARY} no-underline`}>Buy more photos</Link>
      </div>
      <p className={SUB}>Paid downloads, re-downloadable any time. Purchases are linked to your login.</p>
      <MyPhotosPanel onCount={setCount} />
    </>
  );
}
