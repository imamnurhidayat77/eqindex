'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { API } from '../lib/api';
import { Icon } from './figma';

function ResetInner({ visual }) {
  const src = visual
    || 'https://images.unsplash.com/photo-1695133994806-20833ee9d4c2?auto=format&fit=crop&w=1600&q=88';
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!token) { setErr('This link is missing its token — request a new one.'); return; }
    if (form.password.length < 8) { setErr('New password needs at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setErr('Passwords do not match — check and try again.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/reset`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'That didn’t work — request a new link.');
      setDone(true);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <img src={src} alt="Equestrian rider captured by Boss Media" loading="eager" fetchPriority="high" />
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
          <h1>New password.</h1>
          {done ? (
            <>
              <p className="login-intro">Done — you’re signed out everywhere. Sign in with the new one.</p>
              <p className="login-register"><Link href="/login">Sign in</Link></p>
            </>
          ) : (
            <>
              <p className="login-intro">Pick something strong — 8 characters minimum.</p>
              <form onSubmit={submit}>
                <label><span>New password</span>
                  <span className="auth-pass">
                    <input required type={show ? 'text' : 'password'} value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••" autoComplete="new-password" />
                    <button type="button" className="auth-show" onClick={() => setShow((v) => !v)}>
                      {show ? 'Hide' : 'Show'}
                    </button>
                  </span>
                </label>
                <label><span>Confirm new password</span>
                  <input required type={show ? 'text' : 'password'} value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                    placeholder="••••••••" autoComplete="new-password" />
                </label>
                {err && <p className="auth-error" role="alert">{err}</p>}
                <button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : 'Set new password'}
                  <Icon name="arrow" size={18} />
                </button>
              </form>
              <p className="login-register"><Link href="/forgot">Request a new link</Link></p>
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

export default function ResetClient({ visual }) {
  return (
    <Suspense>
      <ResetInner visual={visual} />
    </Suspense>
  );
}
