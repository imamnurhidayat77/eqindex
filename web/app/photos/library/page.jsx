'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, SUB } from '../../../lib/tokens';
import { useAuth } from '../../../components/auth';
import { TableEmpty } from '../../../components/EmptyState';

export default function PhotoLibrary() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API}/api/my/photos`, { credentials: 'include' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) throw new Error('Log in to see your photos.');
      if (!r.ok) throw new Error(j.error || `Failed (${r.status})`);
      setRows(j.data || []);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  useEffect(() => {
    if (!loading && user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const dl = (id) => `${API}/api/media/${id}/download`;

  return (
    <>
      <h1 className={H1}>My photos</h1>
      <p className={SUB}>Paid downloads, re-downloadable any time. Purchases are linked to your login.</p>
      {err && <p className="text-blood text-sm mb-3">{err}</p>}
      {rows === null && !err && (
        <p className="text-muted text-sm mb-3">{busy ? 'Loading…' : ''}</p>
      )}
      {rows !== null && !rows.length && <TableEmpty icon="📷" title="No purchases yet" hint="Bought photos appear here." />}
      {!!rows?.length && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {rows.map((x) => (
            <div key={`${x.purchase_id}-${x.media_id}`} className="rounded border border-line bg-card overflow-hidden">
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
