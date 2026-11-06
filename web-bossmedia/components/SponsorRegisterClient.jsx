'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { API } from '../lib/api';
import { isValidEmail, normalizeEmail } from '../lib/validation.mjs';
import SmartImage from './SmartImage';

function isValidUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function SponsorInner({ visual }) {
  const src =
    visual ||
    'https://images.unsplash.com/photo-1594768816441-1dd241ffaa67?auto=format&fit=crop&w=1600&q=88';
  const [step, setStep] = useState(1);
  const [account, setAccount] = useState({ name: '', email: '', password: '', password2: '' });
  const [show, setShow] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [checking, setChecking] = useState(true);
  const [app, setApp] = useState({ brand: '', website: '', events: '' });
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  // Sponsor access is granted by an admin, never by self-registration.
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return;
        const j = await r.json().catch(() => ({}));
        if (j?.data) {
          setHasAccount(true);
          setAccount((a) => ({ ...a, name: j.data.name || '', email: j.data.email || '' }));
          setStep(2);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  async function submitAccount(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!account.name.trim()) { setErr('Tell us your name.'); return; }
    if (!isValidEmail(account.email)) { setErr('Enter a valid email address.'); return; }
    if (account.password.length < 8) { setErr('Password needs at least 8 characters.'); return; }
    if (account.password !== account.password2) { setErr('Passwords do not match — check and try again.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: account.name.trim().slice(0, 100),
          email: normalizeEmail(account.email),
          password: account.password,
          // NOTE: no sponsor role here on purpose — /auth/register only
          // accepts PUBLIC/RIDER/COACH. Sponsor access is granted by an
          // admin after reviewing the application in step 2.
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Couldn’t create your account — try again.');
      setHasAccount(true);
      setStep(2);
      window.scrollTo({ top: 0 });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function submitApplication(e) {
    e.preventDefault();
    if (busy || sent) return;
    setErr('');
    if (app.brand.trim().length < 2) { setErr('Tell us your brand name.'); return; }
    if (app.website.trim() && !isValidUrl(app.website.trim())) { setErr('Website must start with https:// — or leave it empty.'); return; }
    if (app.events.trim().length < 20) { setErr('Tell us which events or riders you’d like to support (a sentence or two).'); return; }
    if (!accept) { setErr('Please accept the sponsor terms to send your application.'); return; }
    setBusy(true);
    try {
      // Reuses the public corrections inbox (entity_type 'sponsor') so the
      // application lands in the existing admin review queue.
      const message = [
        `Sponsor application from ${account.name.trim() || 'applicant'} <${account.email.trim()}>`,
        '',
        `Brand: ${app.brand.trim()}`,
        app.website.trim() ? `Website: ${app.website.trim()}` : null,
        '',
        `Interested in:\n${app.events.trim()}`,
      ].filter((x) => x !== null).join('\n');
      const res = await fetch(`${API}/corrections`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: account.name.trim().slice(0, 100) || 'Sponsor applicant',
          email: normalizeEmail(account.email),
          subject: `Sponsor application — ${app.brand.trim().slice(0, 60)}`,
          entity_type: 'sponsor',
          message: message.slice(0, 5000),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Couldn’t send your application — try again.');
      setSent(true);
      window.scrollTo({ top: 0 });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <main className="login-page">
      <section className="login-visual">
        <SmartImage src={src} alt="Sponsor branding at an equestrian event" fill sizes="(max-width: 900px) 100vw, 50vw" priority fetchPriority="high" />
        <div className="login-visual-top">
          <Link href="/" className="wordmark inverted">BOSS<span>MEDIA</span></Link>
          <Link href="/">Back to home</Link>
        </div>
        <div className="login-quote">
          <p>Your logo, on winning photos.</p>
          <span>Fund rider discounts, get the coverage.</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">Partners / Sponsors</p>
          <h1>{sent ? 'Application sent.' : 'Join as sponsor.'}</h1>
          {!sent && (
            <p className="login-intro">
              {step === 1
                ? 'First create your free account — sponsor access is approved by our team after review.'
                : 'Now tell us about your brand. We review every application personally.'}
            </p>
          )}

          {checking ? (
            <p className="empty-note" role="status">Checking your session…</p>
          ) : sent ? (
            <div className="auth-card">
              <p className="eyebrow">What happens next</p>
              <p>Thanks — your application is with our team.</p>
              <ul>
                <li>We review applications personally and reply by email.</li>
                <li>Approved sponsors get logo uploads, event budgets and coverage reports.</li>
                <li>You fund the discounts — we handle shop, checkout and billing.</li>
              </ul>
              <p className="btn-row">
                <Link href="/events" className="btn-light">Browse galleries</Link>
                <Link href="/contact" className="btn-ghost">Contact us</Link>
              </p>
            </div>
          ) : step === 1 ? (
            <form onSubmit={submitAccount}>
              <label><span>Full name</span>
                <input required type="text" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })}
                  placeholder="Your name" autoComplete="name" maxLength={100} />
              </label>
              <label><span>Email address</span>
                <input required type="email" value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })}
                  placeholder="you@brand.nz" autoComplete="email" />
              </label>
              <label><span>Password</span>
                <span className="auth-pass">
                  <input required type={show ? 'text' : 'password'} value={account.password}
                    onChange={(e) => setAccount({ ...account, password: e.target.value })}
                    placeholder="At least 8 characters" autoComplete="new-password" minLength={8} maxLength={72} />
                  <button type="button" className="auth-show" aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((v) => !v)}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
              <label><span>Confirm password</span>
                <input required type="password" value={account.password2} onChange={(e) => setAccount({ ...account, password2: e.target.value })}
                  placeholder="Repeat your password" autoComplete="new-password" minLength={8} maxLength={72} />
              </label>
              {err && <p className="auth-error" role="alert">{err}</p>}
              <button type="submit" disabled={busy}>{busy ? 'Creating your account…' : 'Continue to application'}</button>
            </form>
          ) : (
            <form onSubmit={submitApplication}>
              <div className="auth-steps" aria-label="Application progress">
                <span className="done"><span className="auth-step-n">✓</span>Account</span>
                <span className="active"><span className="auth-step-n">2</span>Application</span>
              </div>
              <label><span>Brand name</span>
                <input required type="text" value={app.brand} onChange={(e) => setApp({ ...app, brand: e.target.value })}
                  placeholder="e.g. Mitavite" autoComplete="off" maxLength={100} />
              </label>
              <label><span>Website <em className="auth-opt">(optional)</em></span>
                <input type="url" value={app.website} onChange={(e) => setApp({ ...app, website: e.target.value })}
                  placeholder="https://yourbrand.nz" autoComplete="url" inputMode="url" />
              </label>
              <label><span>Which events or riders interest you?</span>
                <textarea required value={app.events} onChange={(e) => setApp({ ...app, events: e.target.value })}
                  placeholder="e.g. Rotorua Show Jumping — keen to fund logo-photo discounts for junior riders…" rows={4} />
              </label>
              <label className="auth-check">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                <span className="auth-box" aria-hidden="true">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 12.5 5 5L20 6.5" />
                  </svg>
                </span>
                <span>
                  I accept the <Link href="/terms">sponsor terms</Link>
                  {' '}and <Link href="/privacy">Privacy Policy</Link>
                </span>
              </label>
              {err && <p className="auth-error" role="alert">{err}</p>}
              <button type="submit" disabled={busy}>{busy ? 'Sending application…' : 'Send application'}</button>
              {hasAccount && (
                <p className="auth-note">Applying as {account.name.trim()} ({account.email.trim()})</p>
              )}
            </form>
          )}
          <p className="login-register">
            {sent ? (
              <>Questions? <Link href="/contact">Contact us</Link></>
            ) : (
              <>Buying photos instead? <Link href="/register">Create a buyer account</Link> or <Link href="/login">sign in</Link>.</>
            )}
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

export default function SponsorRegisterClient({ visual }) {
  return (
    <Suspense>
      <SponsorInner visual={visual} />
    </Suspense>
  );
}
