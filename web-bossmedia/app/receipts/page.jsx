'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { API } from '../../lib/api';
import { nzd } from '../../lib/figma-data';
import { SiteFooter, SiteHeader } from '../../components/figma';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const lineOf = (p) => {
  if (p.reel_product) return `${p.reel_product}${p.horse ? ` — ${p.horse}` : ''} · Pre-book coverage`;
  const who = [p.horse, p.rider].filter(Boolean).join(' × ');
  return `${who || p.event_name || 'Photo'} · ${p.license_tier || 'license'}`;
};

function Inner() {
  const sp = useSearchParams();
  const ids = useMemo(() => ((sp.get('purchases') || '').split(',').map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 20)), [sp]);
  const [state, setState] = useState('checking'); // checking|paid|pending|unknown
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState('');

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setMe(j?.data?.email || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ids.length) { setState('unknown'); return; }
    let live = true;
    const check = async () => {
      const got = await Promise.all(ids.map(async (id) => {
        try {
          const r = await fetch(`${API}/api/purchases/${id}`, { credentials: 'include' });
          const j = await r.json().catch(() => ({}));
          return r.ok ? j.data : null;
        } catch { return null; }
      }));
      if (!live) return true;
      const paid = got.filter((g) => g && g.status === 'paid');
      if (paid.length === ids.length) { setRows(paid); setState('paid'); return true; }
      if (paid.length || got.some(Boolean)) setState('pending');
      return false;
    };
    check().then((done) => {
      if (done || !live) return;
      const t = setInterval(async () => { if (await check()) clearInterval(t); }, 4000);
      setTimeout(() => clearInterval(t), 60000);
    });
    return () => { live = false; };
  }, [ids]);

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
        ) : state === 'unknown' ? (
          <><h1>Can’t find that order.</h1><p className="empty-note">The link may have expired — check your library.</p><p style={{ marginTop: 18 }}><Link href="/media" style={{ paddingBottom: 5, borderBottom: '1px solid #666', fontSize: 13, color: '#fff' }}>Open my library</Link></p></>
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
