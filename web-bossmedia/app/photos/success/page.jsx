'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { API } from '../../../lib/api';
import { nzd } from '../../../lib/figma-data';
import { usePurchasePoll } from '../../../lib/use-purchase-poll';
import { Icon, SiteFooter, SiteHeader } from '../../../components/figma';
import { useDocumentTitle } from '../../../lib/use-document-title';

function Inner() {
  useDocumentTitle('Order confirmed');
  const sp = useSearchParams();
  const purchase = sp.get('purchase');
  const batchKey = sp.get('purchases') || '';
  const ids = useMemo(() => (purchase ? [purchase]
    : batchKey.split(',').map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 20)),
    [purchase, batchKey]);
  const { state, rows: details, retry } = usePurchasePoll(ids);
  // DIAGNOSTIK: cabang thumbnail dimatikan sementara — dikembalikan
  // setelah halaman paid terbukti sembuh tanpa-nya.
  const subjectOf = (detail) => [detail.horse, detail.rider].filter(Boolean).join(' × ');

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main className="section-gutter" style={{ paddingTop: 72, paddingBottom: 80 }}>
        <p className="eyebrow" style={{ color: '#666' }}>Checkout</p>
        {state === 'checking' && (<><h1 style={{ fontSize: 44 }}>Confirming payment…</h1><p className="empty-note">Talking to Stripe — this usually takes a few seconds.</p></>)}
        {state === 'pending' && (<><h1 style={{ fontSize: 44 }}>Confirming payment…</h1><p className="empty-note">{details.length > 0 ? `${details.length} of ${ids.length} confirmed — ` : ''}still talking to Stripe, this usually takes a few seconds.</p></>)}
        {state === 'login' && (<><h1 style={{ fontSize: 44 }}>One more step.</h1><p className="empty-note">Checked out as a guest? We emailed you an access link — or sign in with the account you checked out with to see your purchase.</p><p style={{ marginTop: 18 }}><Link href={`/login?next=/photos/success?${sp.toString()}`} style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Sign in</Link></p></>)}
        {state === 'paid' && details.length && (
          <><h1 style={{ fontSize: 44 }}>{details.length === 1 ? 'Payment confirmed.' : `${details.length} payments confirmed.`}</h1>
          {details.map((detail) => (
            <div key={detail.id} style={{ marginTop: 14, padding: 16, border: '1px solid #333', background: '#101010', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{detail.reel_product || subjectOf(detail) || 'Your media'}</p>
                <p className="empty-note" style={{ border: 0, background: 'none', padding: 0, marginTop: 6 }}>{detail.reel_product
                  ? `${detail.horse ? ` — ${detail.horse}` : ''} · production started, track it in My media.`
                  : `${detail.event_name ? `${detail.event_name} — ` : ''}watermark-free, yours forever.`}
                  {detail.amount_cents !== null && detail.amount_cents !== undefined && ` · Paid ${nzd(detail.amount_cents)}`}</p>
              </div>
              {detail.media_id && <a href={`${API}/api/media/${detail.media_id}/download`} className="st-btn" style={{ textDecoration: 'none', flex: 'none' }}>Download full file</a>}
            </div>
          ))}
          <p style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}><Link href={`/receipts?purchases=${ids.join(',')}`} className="st-btn" style={{ textDecoration: 'none' }}>Download receipt</Link><Link href="/media" className="st-btn-ghost" style={{ textDecoration: 'none' }}>Open my library</Link></p></>
        )}
        {state === 'unknown' && (<><h1 style={{ fontSize: 44 }}>Can’t find that order.</h1><p className="empty-note">The link may have expired — check your email receipt or library.</p>          <p style={{ marginTop: 18, display: 'flex', gap: 16, flexWrap: 'wrap' }}><button onClick={retry} style={{ paddingBottom: 5, border: 0, borderBottom: '1px solid #666', background: 'none', fontSize: 13, color: '#fff', cursor: 'pointer' }}>Try again</button><Link href="/media" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Open my library</Link><Link href="/contact" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Contact support</Link></p></>)}
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
