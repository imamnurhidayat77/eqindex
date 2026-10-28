'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { API } from '../lib/api';
import { Icon } from './figma';

function safeNext(v) {
  return v && v.startsWith('/') && !v.startsWith('//') && v !== '/login' && v !== '/register'
    ? v
    : '/media';
}

function LoginInner({ visual }) {
  const FIGMA_FALLBACK =
    'https://images.unsplash.com/photo-1695133994806-20833ee9d4c2?auto=format&fit=crop&w=1600&q=88';
  const src = visual || FIGMA_FALLBACK;
  const router = useRouter();
  const sp = useSearchParams();
  const rawNext = sp.get('next');
  const next = safeNext(rawNext);
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!form.email.trim() || !form.password) { setErr('Enter your email and password.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), password: form.password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'That didn’t work — check your details and try again.');
      if (j.data?.mfa_required) { setChallenge(j.data.challenge); setBusy(false); return; }
      land(j.data?.role);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  function land(role) {
    // Staff land in their workspace unless a deep link asked otherwise.
    router.push(!rawNext && (role === 'ADMIN' || role === 'PHOTOGRAPHER') ? '/studio' : next);
  }

  async function submitCode(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!/^\d{6}$/.test(code.trim())) { setErr('Enter the 6-digit code from your authenticator app.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/mfa/challenge`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, token: code.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'That didn’t work — try again.');
      land(j.data?.role);
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
          <p className="eyebrow">Boss Media account</p>
          <h1>Welcome back.</h1>
          <p className="login-intro">Sign in to access purchased media, private galleries, and coverage bookings.</p>
          {challenge ? (
            <form onSubmit={submitCode}>
              <label><span>Authenticator code</span>
                <input required inputMode="numeric" autoComplete="one-time-code" value={code}
                  onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} />
              </label>
              {err && <p className="auth-error" role="alert">{err}</p>}
              <button type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Verify and sign in'}
                <Icon name="arrow" size={18} />
              </button>
            </form>
          ) : (
          <form onSubmit={submit}>
            <label><span>Email address</span>
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" autoComplete="email" />
            </label>
            <label><span>Password</span>
              <span className="auth-pass">
                <input required type={show ? 'text' : 'password'} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••" autoComplete="current-password" />
                <button type="button" className="auth-show" onClick={() => setShow((v) => !v)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            <div className="login-options">
              <Link href="/forgot">Forgot password?</Link>
            </div>
            {err && <p className="auth-error" role="alert">{err}</p>}
            <button type="submit" disabled={busy}>
              {busy ? 'One moment…' : 'Sign in'}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          )}
          <p className="login-register">
            New to Boss Media? <Link href={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link>
          </p>
          <p className="login-register login-register-tight">
            Shoot for us? <Link href="/register/photographer">Join as photographer</Link>
            {' · '}Run events? <Link href="/register/organizer">Join as organizer</Link>
          </p>
        </div>
        <footer>
          <p>© 2026 Boss Media</p>
          <div><Link href="/privacy">Privacy</Link><Link href="/faq">Help</Link></div>
        </footer>
      </section>
    </main>
  );
}

export default function LoginClient({ visual }) {
  return (
    <Suspense>
      <LoginInner visual={visual} />
    </Suspense>
  );
}
