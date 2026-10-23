'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { Icon, SiteFooter, SiteHeader } from '../../../components/figma';

function Inner() {
  const sp = useSearchParams();
  const purchase = sp.get('purchase');
  const [state, setState] = useState('checking'); // checking|paid|login|unknown
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!purchase) { setState('unknown'); return; }
    let live = true;
    const check = async () => {
      try {
        const r = await fetch(`${API}/api/purchases/${purchase}`, { credentials: 'include' });
        if (r.status === 401) { if (live) setState('login'); return true; }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { if (live) setState('unknown'); return true; }
        if (j.data?.status === 'paid') { if (live) { setDetail(j.data); setState('paid'); } return true; }
      } catch {}
      return false;
    };
    check().then((done) => {
      if (done || !live) return;
      const t = setInterval(async () => { if (await check()) clearInterval(t); }, 4000);
      setTimeout(() => clearInterval(t), 60000);
    });
    return () => { live = false; };
  }, [purchase]);

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main className="section-gutter" style={{ paddingTop: 72, paddingBottom: 110, minHeight: '60vh' }}>
        <p className="eyebrow" style={{ color: '#666' }}>Checkout</p>
        {state === 'checking' && (<><h1 style={{ fontSize: 44 }}>Confirming payment…</h1><p className="empty-note">Talking to Stripe — this usually takes a few seconds.</p></>)}
        {state === 'login' && (<><h1 style={{ fontSize: 44 }}>One more step.</h1><p className="empty-note">Sign in with the account you checked out with to see your purchase.</p><p style={{ marginTop: 18 }}><Link href={`/login?next=/photos/success?purchase=${purchase}`} style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Sign in</Link></p></>)}
        {state === 'paid' && detail && (
          <><h1 style={{ fontSize: 44 }}>Payment confirmed.</h1>
          <p className="empty-note">{detail.horse || detail.rider ? `${[detail.horse, detail.rider].filter(Boolean).join(' × ')} · ` : ''}{detail.event_name || detail.reel_product || 'Your media'} — watermark-free, yours forever.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
            {detail.media_id && <a href={`${API}/api/media/${detail.media_id}/download`} className="st-btn" style={{ textDecoration: 'none' }}>Download full file</a>}
            <Link href="/media" className="st-btn-ghost" style={{ textDecoration: 'none' }}>Open my library</Link>
          </div></>
        )}
        {state === 'unknown' && (<><h1 style={{ fontSize: 44 }}>Can’t find that order.</h1><p className="empty-note">The link may have expired — check your email receipt or library.</p><p style={{ marginTop: 18 }}><Link href="/media" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Open my library</Link></p></>)}
      </main>
      <SiteFooter />
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
