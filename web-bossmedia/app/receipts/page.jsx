'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { API } from '../../lib/api';
import { fmtDay } from '../../lib/format';
import { nzd } from '../../lib/figma-data';
import { useAuthed } from '../../lib/use-authed';
import { usePurchasePoll } from '../../lib/use-purchase-poll';
import { SiteFooter, SiteHeader } from '../../components/figma';
import { useDocumentTitle } from '../../lib/use-document-title';

const lineOf = (p) => {
  if (p.reel_product) return `${p.reel_product}${p.horse ? ` — ${p.horse}` : ''} · Pre-book coverage`;
  const who = [p.horse, p.rider].filter(Boolean).join(' × ');
  return `${who || p.event_name || 'Photo'} · ${p.license_tier || 'license'}`;
};

function Inner() {
  useDocumentTitle('Receipt');
  const sp = useSearchParams();
  const ids = useMemo(() => ((sp.get('purchases') || '').split(',').map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 20)), [sp]);
  const { state, rows, retry } = usePurchasePoll(ids);
  const { user } = useAuthed();
  const me = user?.email || '';

  const subtotal = rows.reduce((s, r) => s + Number(r.amount_cents || 0), 0);
  const gst = Math.round((subtotal / 1.15) * 0.15);

  return (
    <div className="gallery-page">
      <SiteHeader />
      <main className="section-gutter receipt-page">
        <p className="eyebrow" style={{ color: '#666' }}>Receipt</p>
        {state === 'paid' ? (
          <>
            <h1>Paid in full.</h1>
            <p className="rc-meta">
              Boss Media · {fmtDay(rows[0]?.created_at)} · No. BM-{String(ids[0]).slice(0, 8).toUpperCase()}
              {me ? ` · ${me}` : ''}
            </p>
            <table className="st-table rc-lines">
              <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}><td>{lineOf(r)}</td><td style={{ textAlign: 'right' }}>{nzd(r.amount_cents)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="rc-totals">
              <p><span>Subtotal</span><span>{nzd(subtotal)}</span></p>
              <p><span>GST included</span><span>{nzd(gst)}</span></p>
              <p className="rc-grand"><span>Total paid</span><span>{nzd(subtotal)}</span></p>
            </div>
            <div className="rc-actions receipt-print-no">
              <button type="button" className="st-btn" onClick={() => window.print()}>Print / save PDF</button>
              <Link href="/media" className="st-btn-ghost" style={{ textDecoration: 'none' }}>Open my library</Link>
            </div>
          </>
        ) : state === 'pending' ? (
          <><h1>Payment pending.</h1><p className="empty-note">Stripe is still confirming — this page turns into your receipt automatically.</p></>
        ) : state === 'login' ? (
          <><h1>One more step.</h1><p className="empty-note">Checked out as a guest? We emailed you an access link — or sign in to see this receipt.</p><p style={{ marginTop: 18 }}><Link href={`/login?next=/receipts?${sp.toString()}`} style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Sign in</Link></p></>
        ) : state === 'unknown' ? (
          <><h1>Can’t find that order.</h1><p className="empty-note">The link may have expired — check your library.</p><p style={{ marginTop: 18, display: 'flex', gap: 16, flexWrap: 'wrap' }}><button onClick={retry} style={{ paddingBottom: 5, border: 0, borderBottom: '1px solid #666', background: 'none', fontSize: 13, color: '#fff', cursor: 'pointer' }}>Try again</button><Link href="/media" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Open my library</Link></p></>
        ) : (
          <><h1>Confirming payment…</h1><p className="empty-note">Talking to Stripe — this usually takes a few seconds.</p></>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default function ReceiptsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
