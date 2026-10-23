'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { API } from '../lib/api';
import { Icon } from './figma';

const REGIONS = [
  'Northland', 'Auckland', 'Waikato', 'Bay of Plenty', 'Gisborne', 'Hawke’s Bay',
  'Taranaki', 'Manawatū-Whanganui', 'Wellington', 'Tasman', 'Nelson', 'Marlborough',
  'West Coast', 'Canterbury', 'Otago', 'Southland', 'Nationwide',
];

function isValidUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function PhotographerInner({ visual }) {
  const src =
    visual ||
    'https://images.unsplash.com/photo-1594768816441-1dd241ffaa67?auto=format&fit=crop&w=1600&q=88';
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [account, setAccount] = useState({ name: '', email: '', password: '', password2: '' });
  const [show, setShow] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [checking, setChecking] = useState(true);
  const [app, setApp] = useState({ portfolio: '', region: '', events: '', gear: '', handle: '' });
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  // Best practice: photographer access is granted by an admin, never by
  // self-registration. If the visitor already has an account we skip straight
  // to the application and tie it to their session identity.
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
    if (!account.name.trim()) { setErr('Tell us your name — it appears on your photographer profile.'); return; }
    if (!account.email.trim()) { setErr('Enter your email address.'); return; }
    if (account.password.length < 8) { setErr('Password needs at least 8 characters.'); return; }
    if (account.password !== account.password2) { setErr('Passwords do not match — check and try again.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: account.name.trim().slice(0, 100),
          email: account.email.trim(),
          password: account.password,
          // NOTE: no photographer role here on purpose — /auth/register only
          // accepts PUBLIC/RIDER/COACH. Contributor access is granted by an
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
    const portfolio = app.portfolio.trim();
    if (!isValidUrl(portfolio)) { setErr('Add your portfolio link starting with https:// so we can review your work.'); return; }
    if (!app.region) { setErr('Choose the region you mainly cover.'); return; }
    if (app.events.trim().length < 20) { setErr('Tell us about events you’ve covered (at least a sentence or two).'); return; }
    if (!accept) { setErr('Please accept the contributor terms to send your application.'); return; }
    setBusy(true);
    try {
      // Reuses the public corrections inbox (entity_type 'other') so the
      // application lands in the existing admin review queue — no new
      // privileged endpoint, no new table.
      const message = [
        `Photographer application from ${account.name.trim() || 'applicant'} <${account.email.trim()}>`,
        '',
        `Portfolio: ${portfolio}`,
        `Region: ${app.region}`,
        app.handle.trim() ? `Social: ${app.handle.trim()}` : null,
        '',
        `Events covered:\n${app.events.trim()}`,
        app.gear.trim() ? `\nGear:\n${app.gear.trim()}` : null,
      ].filter((x) => x !== null).join('\n');
      const res = await fetch(`${API}/corrections`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: account.name.trim().slice(0, 100) || 'Photographer applicant',
          email: account.email.trim(),
          subject: `Photographer application — ${(account.name.trim() || 'applicant').slice(0, 60)}`,
          entity_type: 'other',
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
        <img src={src} alt="Photographer covering an equestrian event" loading="eager" fetchPriority="high" />
        <div className="login-visual-top">
          <Link href="/" className="wordmark inverted">BOSS<span>MEDIA</span></Link>
          <Link href="/">Back to home</Link>
        </div>
        <div className="login-quote">
          <p>Shoot. We’ll handle the shop.</p>
          <span>Checkout, delivery and support — covered.</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">Contributors / Photographers</p>
          <h1>{sent ? 'Application sent.' : 'Join as photographer.'}</h1>
          {!sent && (
            <p className="login-intro">
              {step === 1
                ? 'First create your free account — contributor access is approved by our team after review.'
                : 'Now tell us about your work. We review every application personally.'}
            </p>
          )}

          {checking ? (
            <p className="empty-note" role="status">Checking your session…</p>
          ) : sent ? (
            <div className="auth-card">
              <p className="eyebrow">What happens next</p>
              <p>Thanks, {account.name.trim().split(' ')[0] || 'photographer'} — your application is with our team.</p>
              <ul>
                <li>We review portfolios personally and reply by email.</li>
                <li>Approved contributors get upload access and a payout profile.</li>
                <li>You keep shooting — we handle the shop, checkout and delivery.</li>
              </ul>
              <p className="btn-row">
                <Link href="/events" className="btn-light">Browse galleries</Link>
                <Link href="/media" className="btn-ghost">Go to my media</Link>
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
                  placeholder="you@example.nz" autoComplete="email" />
              </label>
              <label><span>Password</span>
                <span className="auth-pass">
                  <input required type={show ? 'text' : 'password'} value={account.password}
                    onChange={(e) => setAccount({ ...account, password: e.target.value })}
                    placeholder="At least 8 characters" autoComplete="new-password" minLength={8} maxLength={72} />
                  <button type="button" className="auth-show" onClick={() => setShow((v) => !v)}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </span>
              </label>
              <label><span>Confirm password</span>
                <input required type="password" value={account.password2} onChange={(e) => setAccount({ ...account, password2: e.target.value })}
                  placeholder="Repeat your password" autoComplete="new-password" minLength={8} maxLength={72} />
              </label>
              {err && <p className="auth-error" role="alert">{err}</p>}
              <button type="submit" disabled={busy}>
                {busy ? 'Creating your account…' : 'Continue to application'}
                <Icon name="arrow" size={18} />
              </button>
            </form>
          ) : (
            <form onSubmit={submitApplication}>
              <div className="auth-steps" aria-label="Application progress">
                <span className="done"><span className="auth-step-n">✓</span>1 · Account</span>
                <span className="active"><span className="auth-step-n">2</span>Application</span>
              </div>
              <label><span>Portfolio link</span>
                <input required type="url" value={app.portfolio} onChange={(e) => setApp({ ...app, portfolio: e.target.value })}
                  placeholder="https://yourportfolio.nz" autoComplete="url" inputMode="url" />
              </label>
              <label><span>Main region</span>
                <select required value={app.region} onChange={(e) => setApp({ ...app, region: e.target.value })}>
                  <option value="" disabled>Select a region…</option>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label><span>Events you’ve covered</span>
                <textarea required value={app.events} onChange={(e) => setApp({ ...app, events: e.target.value })}
                  placeholder="Which shows, seasons, or disciplines have you shot? e.g. two seasons of showjumping across Waikato…" rows={4} />
              </label>
              <label><span>Gear <em className="auth-opt">(optional)</em></span>
                <input type="text" value={app.gear} onChange={(e) => setApp({ ...app, gear: e.target.value })}
                  placeholder="Bodies, lenses — short is fine" autoComplete="off" />
              </label>
              <label><span>Instagram / social <em className="auth-opt">(optional)</em></span>
                <input type="text" value={app.handle} onChange={(e) => setApp({ ...app, handle: e.target.value })}
                  placeholder="@yourhandle" autoComplete="off" />
              </label>
              <label className="auth-check">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                <span className="auth-box" aria-hidden="true">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 12.5 5 5L20 6.5" />
                  </svg>
                </span>
                <span>
                  I accept the <Link href="/terms">contributor terms</Link>
                  {' '}and <Link href="/privacy">Privacy Policy</Link>
                </span>
              </label>
              {err && <p className="auth-error" role="alert">{err}</p>}
              <button type="submit" disabled={busy}>
                {busy ? 'Sending application…' : 'Send application'}
                <Icon name="arrow" size={18} />
              </button>
              {hasAccount && (
                <p className="auth-note">
                  Applying as {account.name.trim()} ({account.email.trim()})
                </p>
              )}
            </form>
          )}
          <p className="login-register">
            {sent ? (
              <>Questions? <Link href="/contact">Contact us</Link></>
            ) : (
              <>Just want to buy photos? <Link href="/register">Create a buyer account</Link>
              {' · '}Have an account? <Link href="/login">Sign in</Link></>
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

export default function PhotographerRegisterClient({ visual }) {
  return (
    <Suspense>
      <PhotographerInner visual={visual} />
    </Suspense>
  );
}
