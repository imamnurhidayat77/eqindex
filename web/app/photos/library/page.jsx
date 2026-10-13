'use client';
import Link from 'next/link';
import { useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB, INP, BTN_PRIMARY } from '../../../lib/tokens';
import { useAuth } from '../../../components/auth';
import { TableEmpty } from '../../../components/EmptyState';

export default function PhotoLibrary() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const em = user?.email || email;

  async function load() {
    if (!em.trim()) { setErr('Enter the email you bought with.'); return; }
    setBusy(true); setErr('');
    try {
      const p = new URLSearchParams({ email: em.trim() });
      const r = await fetch(`${API}/api/my/photos?${p}`, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setRows(j.data || []);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const dl = (id) => `${API}/api/media/${id}/download?email=${encodeURIComponent(em.trim())}`;

  return (
    <>
      <h1 className={H1}>My photos</h1>
      <p className={SUB}>Paid downloads, re-downloadable any time.</p>
      {!user?.email && (
        <div className="flex flex-wrap items-end gap-2.5 mb-4">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Purchase email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={INP} style={{ width: 260 }} /></label>
          <button onClick={load} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Loading…' : 'Show my photos'}</button>
        </div>
      )}
      {user?.email && rows === null && (
        <div className="mb-4"><button onClick={load} disabled={busy} className={BTN_PRIMARY}>{busy ? 'Loading…' : 'Show my photos'}</button></div>
      )}
      {err && <p className="text-blood text-sm mb-3">{err}</p>}
      {rows !== null && !rows.length && <TableEmpty icon="📷" title="No purchases yet" hint="Bought photos appear here." />}
      {!!rows?.length && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {rows.map((x) => (
            <div key={x.purchase_id} className="rounded border border-line bg-card overflow-hidden">
              <div className="aspect-[4/3] bg-card2 flex items-center justify-center overflow-hidden">
                {x.thumb_url || x.preview_url
                  ? <img src={x.thumb_url || x.preview_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                  : <span className="text-2xl">📷</span>}
              </div>
              <div className="p-2.5">
                <div className="text-[13px] font-bold text-white truncate">
                  {[x.horse, x.rider].filter(Boolean).join(' × ') || x.event_name || 'Photo'}
                </div>
                <div className="text-[11px] text-faint">{x.license_tier || ''}</div>
                <a href={dl(x.media_id)} className="inline-block mt-2 text-[13px] font-bold text-gold no-underline hover:underline">Download full-res ↓</a>
              </div>
            </div>
          ))}
        </div>
      )}
      <section className={CARD}>
        <Link href="/photos" className="text-sky text-sm no-underline hover:underline">← Back to gallery</Link>
      </section>
    </>
  );
}
