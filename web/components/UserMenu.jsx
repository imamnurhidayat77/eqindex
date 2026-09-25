'use client';
import { useState } from 'react';
import { useAuth } from './auth';

export default function UserMenu() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (loading) {
    return <span className="w-8 h-8 rounded-full border-[1.5px] border-line inline-flex items-center justify-center text-[15px]">🐎</span>;
  }
  if (!user) {
    return (
      <span className="flex items-center gap-2">
        <a href="/login" className="text-muted text-[13px] no-underline hover:text-white hidden sm:inline">Log in</a>
        <a href="/register" className="bg-gold text-black font-bold rounded px-3 py-1.5 text-[13px] no-underline">Join</a>
      </span>
    );
  }
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
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
          <a href="/watchlist" onClick={() => setOpen(false)} className="block px-2 py-1.5 text-[13px] text-muted no-underline hover:text-white">My Watchlist</a>
          {user.role === 'ADMIN' && (
            <a href="/admin/review" onClick={() => setOpen(false)} className="block px-2 py-1.5 text-[13px] text-muted no-underline hover:text-white">Review Queue</a>
          )}
          <button onClick={() => { logout(); setOpen(false); }}
            className="block w-full text-left px-2 py-1.5 text-[13px] text-blood bg-none border-0 cursor-pointer">Log out</button>
        </span>
      )}
    </span>
  );
}
