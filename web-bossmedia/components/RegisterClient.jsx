'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { API } from '../lib/api';
import { Icon } from './figma';
import SmartImage from './SmartImage';

function safeNext(v) {
  return v && v.startsWith('/') && !v.startsWith('//') && v !== '/login' && v !== '/register'
    ? v
    : '/media';
}

function passwordScore(pw) {
  if (!pw) return 0;
  if (pw.length < 8) return 1;
  if (pw.length < 12) return 2;
  return 3;
}

function RegisterInner({ visual }) {
  const src =
    visual ||
    'https://images.unsplash.com/photo-1594768816441-1dd241ffaa67?auto=format&fit=crop&w=1600&q=88';
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get('next'));
  const [form, setForm] = useState({ name: '', email: '', password: '', password2: '' });
  const [show, setShow] = useState(false);
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [alreadyIn, setAlreadyIn] = useState(false);
  const [done, setDone] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [err, setErr] = useState('');

  // If already logged in, don't strand them on a dead-end card.
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? setAlreadyIn(true) : null))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const score = passwordScore(form.password);

  async function submit(e) {
    e.preventDefault();
    if (busy || done) return;
    setErr('');
    if (!form.name.trim()) { setErr('Tell us your name — it goes on your galleries and receipts.'); return; }
    if (!form.email.trim()) { setErr('Enter your email address.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setErr('Enter a valid email address.'); return; }
    if (form.password.length < 8) { setErr('Password needs at least 8 characters.'); return; }
    if (form.password !== form.password2) { setErr('Passwords do not match — check and try again.'); return; }
    if (!accept) { setErr('Please accept the Terms and Privacy Policy to create your account.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim().slice(0, 100),
          email: form.email.trim(),
          password: form.password,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Couldn’t create your account — try again.');
      if (j.data?.claim_sent) { setClaimed(true); setBusy(false); return; }
      setDone(true);
      router.push(next);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  if (done) {
    return (
      <main className="login-page">
        <section className="login-visual" aria-hidden="true">
          <SmartImage src={src} alt="Equestrian rider jumping at event" fill sizes="(max-width: 900px) 100vw, 50vw" />
        </section>
        <section className="login-panel">
          <div className="login-form-wrap auth-centered">
            <p className="eyebrow">Account created</p>
            <h1>Welcome aboard.</h1>
            <p className="login-intro">Taking you to your media library…</p>
            <p className="auth-note"><span className="bm-spinner" aria-hidden="true" /></p>
          </div>
        </section>
      </main>
    );
  }

  if (claimed) {
    return (
      <main className="login-page">
        <section className="login-visual" aria-hidden="true">
          <SmartImage src={src} alt="Equestrian rider jumping at event" fill sizes="(max-width: 900px) 100vw, 50vw" />
        </section>
        <section className="login-panel">
          <div className="login-form-wrap auth-centered">
            <p className="eyebrow">Almost there</p>
            <h1>Check your inbox.</h1>
            <p className="login-intro">This email already has purchases under a guest account — we sent a link to set a password and claim everything in one go. It expires in 1 hour.</p>
            <p className="login-register"><Link href="/login">Back to sign in</Link></p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <SmartImage src={src} alt="Horse and rider captured by Boss Media" fill sizes="(max-width: 900px) 100vw, 50vw" priority fetchPriority="high" />
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
          <h1>Create your account.</h1>
          <p className="login-intro">Buy photos and reels, save favourites, and pre-book coverage. Free — pay only for what you keep.</p>
          {checking ? (
            <p className="auth-note" role="status">Checking your session…</p>
          ) : alreadyIn ? (
            <div className="auth-card">
              <p className="eyebrow">Already signed in</p>
              <p>You’re already logged in — head to your library or keep browsing.</p>
              <p className="btn-row">
                <Link href={next} className="btn-light">Go to my media</Link>
                <Link href="/events" className="btn-ghost">Browse galleries</Link>
              </p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate={false}>
              <label><span>Full name</span>
                <input required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your name" autoComplete="name" maxLength={100} />
              </label>
              <label><span>Email address</span>
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.nz" autoComplete="email" />
              </label>
              <label><span>Password</span>
                <span className="auth-pass">
                  <input required type={show ? 'text' : 'password'} value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="At least 8 characters" autoComplete="new-password" minLength={8} maxLength={72} />
                  <button type="button" className="auth-show" aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((v) => !v)}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
              {form.password.length > 0 && (
                <>
                  <div className={`auth-meter ${score >= 3 ? 'good' : score >= 1 ? 'mid' : ''}`} aria-hidden="true">
                    {[1, 2, 3].map((i) => (
                      <i key={i} className={score >= i ? 'on' : ''} />
                    ))}
                  </div>
                  <p className="auth-meter-text" role="status">
                    {score >= 3 ? 'Strong password — nice.' : score >= 1 ? 'Getting there — 8+ characters with a mix.' : 'Weak — use 8+ characters.'}
                  </p>
                </>
              )}
              <label><span>Confirm password</span>
                <input required type="password" value={form.password2} onChange={(e) => setForm({ ...form, password2: e.target.value })}
                  placeholder="Repeat your password" autoComplete="new-password" minLength={8} maxLength={72} />
              </label>
              <label className="auth-check">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                <span className="auth-box" aria-hidden="true">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 12.5 5 5L20 6.5" />
                  </svg>
                </span>
                <span>
                  I accept the <Link href="/terms">Terms</Link>
                  {' '}and <Link href="/privacy">Privacy Policy</Link>
                </span>
              </label>
              {err && <p className="auth-error" role="alert">{err}</p>}
              <button type="submit" disabled={busy}>
                {busy ? 'Creating your account…' : 'Create account'}
                <Icon name="arrow" size={18} />
              </button>
            </form>
          )}
          <p className="login-register">
            Have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
            {' · '}Shoot for us? <Link href="/register/photographer">Join as photographer</Link>
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

export default function RegisterClient({ visual }) {
  return (
    <Suspense>
      <RegisterInner visual={visual} />
    </Suspense>
  );
}
