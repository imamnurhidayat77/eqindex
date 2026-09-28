'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth';

export default function UserMenu() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (loading) {
    return <span className="w-8 h-8 rounded-full border-[1.5px] border-line inline-flex items-center justify-center text-[15px]">🐎</span>;
  }
  if (!user) {
    return (
      <span className="flex items-center gap-2">
        <Link href="/login" className="text-muted text-[13px] no-underline hover:text-white hidden sm:inline">Log in</Link>
        <Link href="/register" className="bg-gold text-black font-bold rounded px-3 py-1.5 text-[13px] no-underline">Join</Link>
      </span>
    );
  }
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try { await logout(); } finally { /* lanjut redirect walau API gagal */ }
    setOpen(false);
    setBusy(false);
    router.push('/login');
  }
  return (
    <span className="relative">
      <button onClick={() => setOpen((o) => !o)} title={`${user.name} (${user.role})`}
        className="w-8 h-8 rounded-full border-[1.5px] border-gold bg-goldbg text-gold font-bold inline-flex items-center justify-center text-[15px]">
        {initial}
      </button>
      {open && (
        <span className="absolute right-0 top-10 z-30 w-[210px] block rounded border border-line bg-card2 p-2 shadow-xl">
          <span className="block px-2 py-1.5 text-[13px] font-bold text-white truncate">{user.name}</span>
          <span className="block px-2 pb-1.5 text-[11px] text-muted">{user.email} · {user.role}</span>
          <Link href="/watchlist" onClick={() => setOpen(false)} className="block px-2 py-1.5 text-[13px] text-muted no-underline hover:text-white">My Watchlist</Link>
          {user.role === 'ADMIN' && (
            <Link href="/admin/review" onClick={() => setOpen(false)} className="block px-2 py-1.5 text-[13px] text-muted no-underline hover:text-white">Review Queue</Link>
          )}
          <button onClick={handleLogout} disabled={busy}
            className="flex w-full items-center gap-2 text-left px-2 py-1.5 text-[13px] text-blood bg-none border-0 cursor-pointer disabled:opacity-60 disabled:cursor-wait">
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Logging out…' : 'Log out'}</button>
        </span>
      )}
    </span>
  );
}
