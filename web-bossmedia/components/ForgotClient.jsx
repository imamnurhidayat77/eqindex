'use client';
import Link from 'next/link';
import { useState } from 'react';
import { API } from '../lib/api';
import { Icon } from './figma';
import { isValidEmail, normalizeEmail } from '../lib/validation.mjs';
import SmartImage from './SmartImage';

export default function ForgotClient({ visual }) {
  const src = visual
    || 'https://images.unsplash.com/photo-1695133994806-20833ee9d4c2?auto=format&fit=crop&w=1600&q=88';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!email.trim()) { setErr('Enter your email address.'); return; }
    if (!isValidEmail(email)) { setErr('Enter a valid email address.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/forgot`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizeEmail(email) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'That didn’t work — try again.');
      setSent(true);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <SmartImage src={src} alt="Equestrian rider captured by Boss Media" fill sizes="(max-width: 900px) 100vw, 50vw" priority fetchPriority="high" />
        <div className="login-visual-top">
          <Link href="/" className="wordmark inverted">BOSS<span>MEDIA</span></Link>
          <Link href="/">Back to home</Link>
        </div>
        <div className="login-quote">
          <p>Every ride, kept.</p>
          <span>Your galleries and bookings in one place.</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">Password reset</p>
          <h1>Forgot it?</h1>
          {sent ? (
            <>
              <p className="login-intro">If that address has an account, a reset link is on its way — it expires in 1 hour. Check spam too.</p>
              <p className="login-register"><Link href="/login">Back to sign in</Link></p>
            </>
          ) : (
            <>
              <p className="login-intro">Enter the email you signed up with. We’ll send a one-hour reset link.</p>
              <form onSubmit={submit}>
                <label><span>Email address</span>
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="email" />
                </label>
                {err && <p className="auth-error" role="alert">{err}</p>}
                <button type="submit" disabled={busy}>
                  {busy ? 'Sending…' : 'Send reset link'}
                  <Icon name="arrow" size={18} />
                </button>
              </form>
              <p className="login-register"><Link href="/login">Back to sign in</Link></p>
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
