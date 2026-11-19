'use client';
// First-time email uploader verification: proves inbox ownership (the
// anti-spoofing gate), captures rider/horse claims + consent + optional
// phone in one step. Same login-page chrome as reset — no new CSS.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { API } from '../lib/api';
import { Icon } from './figma';
import SmartImage from './SmartImage';

function VerifyInner() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ rider: '', horse: '', phone: '', consent: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API}/api/upload/verify?token=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j }))).catch(() => ({ ok: false, j: {} }))
      .then(({ ok, j }) => {
        if (!ok) setErr(j.error || 'This link is expired, used, or invalid.');
        else setInfo(j.data);
        setLoading(false);
      })
      .catch(() => { setErr('Could not load — check your connection and try again.'); setLoading(false); });
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!form.consent) { setErr('Please tick the permission box — without it we cannot publish your photos.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/upload/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          rider_name: form.rider.trim(),
          horse_name: form.horse.trim(),
          phone: form.phone.trim(),
          consent: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'That didn’t work — try again.');
      setDone(j.data);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <SmartImage src="https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1600&q=80" alt="Show jumper clearing a fence" fill sizes="(max-width: 900px) 100vw, 50vw" priority fetchPriority="high" />
        <div className="login-visual-top">
          <Link href="/" className="wordmark inverted">BOSS<span>MEDIA</span></Link>
          <Link href="/">Back to home</Link>
        </div>
        <div className="login-quote">
          <p>Shared from the rail.</p>
          <span>Community moments, reviewed before they go live.</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">Community upload</p>
          <h1>Confirm your photos.</h1>
          {loading ? (
            <p className="login-intro">Checking your link…</p>
          ) : done ? (
            <>
              <p className="login-intro">
                You’re verified — {done.photos_queued ?? 'your'} photo{done.photos_queued === 1 ? ' is' : 's are'} queued for a quick check.
                Nothing is published yet; our team reviews every community photo first.
              </p>
              <p className="login-register"><Link href="/events">Browse events</Link></p>
            </>
          ) : !info ? (
            <>
              <p className="login-intro">{err || 'This link didn’t work.'}</p>
              <p className="login-register">Send a fresh email to get a new link — no account needed.</p>
            </>
          ) : (
            <>
              <p className="login-intro">
                {info.photo_count ?? ''} photo{(info.photo_count === 1 ? '' : 's')} from <strong>{info.event || 'your event'}</strong>,
                sent from {info.sender}. One step before our team reviews {info.photo_count === 1 ? 'it' : 'them'}:
              </p>
              <form onSubmit={submit}>
                <label><span>Who did you photograph? (rider, optional)</span>
                  <input type="text" value={form.rider} maxLength={120}
                    onChange={(e) => setForm({ ...form, rider: e.target.value })}
                    placeholder="e.g. Jessie Goggin" autoComplete="off" />
                </label>
                <label><span>Horse (optional)</span>
                  <input type="text" value={form.horse} maxLength={120}
                    onChange={(e) => setForm({ ...form, horse: e.target.value })}
                    placeholder="e.g. Tiraumea My Beau" autoComplete="off" />
                </label>
                <label><span>Mobile (optional — for upload credit + photo-live texts)</span>
                  <input type="tel" value={form.phone} maxLength={20}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="e.g. 021 123 456" autoComplete="tel" />
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.consent} style={{ marginTop: 4 }}
                    onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                  <span style={{ fontSize: 13, color: '#999', lineHeight: 1.6 }}>
                    I took these photos (or I have the right to share them) and the people visible —
                    especially children — are happy for them to appear on Boss Media.
                  </span>
                </label>
                {err && <p className="auth-error" role="alert">{err}</p>}
                <button type="submit" disabled={busy}>
                  {busy ? 'Confirming…' : 'Confirm & send for review'}
                  <Icon name="arrow" size={18} />
                </button>
              </form>
              <p className="login-register"><Link href="/privacy">How we handle your details</Link></p>
            </>
          )}
        </div>
        <footer>
          <p>© 2026 Boss Media</p>
          <div><Link href="/privacy">Privacy</Link><Link href="/faq">Help</Link></div>
        </footer>
      </section>
    </main>
  );
}

export default function VerifyUploadClient() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
