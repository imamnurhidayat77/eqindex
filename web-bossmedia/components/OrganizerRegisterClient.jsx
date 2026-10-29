'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { API } from '../lib/api';
import { Icon } from './figma';
import SearchSelect from './SearchSelect';

const REGIONS = [
  'Northland', 'Auckland', 'Waikato', 'Bay of Plenty', 'Gisborne', 'Hawke’s Bay',
  'Taranaki', 'Manawatū-Whanganui', 'Wellington', 'Tasman', 'Nelson', 'Marlborough',
  'West Coast', 'Canterbury', 'Otago', 'Southland', 'Nationwide',
];

function OrganizerInner({ visual }) {
  const src =
    visual ||
    'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1600&q=88';
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [account, setAccount] = useState({ name: '', email: '', password: '', password2: '' });
  const [show, setShow] = useState(false);
  const [hasAccount, setHasAccount] = useState(false);
  const [checking, setChecking] = useState(true);
  const [app, setApp] = useState({ org: '', region: '', events: '', contact: '' });
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  // Same rule as photographers: the ORGANIZER role is granted by an admin,
  // never by self-registration. Signed-in visitors skip to the application.
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
          // NOTE: no organizer role here on purpose — /auth/register only
          // accepts PUBLIC/RIDER/COACH. Organizer access is granted by an
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
    if (app.org.trim().length < 2) { setErr('Tell us your organization or show name.'); return; }
    if (!app.region) { setErr('Choose the region your events are in.'); return; }
    if (app.events.trim().length < 20) { setErr('Tell us about the events you run (at least a sentence or two).'); return; }
    if (!accept) { setErr('Please accept the organizer terms to send your application.'); return; }
    setBusy(true);
    try {
      const message = [
        `Organizer application from ${account.name.trim() || 'applicant'} <${account.email.trim()}>`,
        '',
        `Organization: ${app.org.trim()}`,
        `Region: ${app.region}`,
        app.contact.trim() ? `Contact: ${app.contact.trim()}` : null,
        '',
        `Events:\n${app.events.trim()}`,
      ].filter((x) => x !== null).join('\n');
      const res = await fetch(`${API}/corrections`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: account.name.trim().slice(0, 100) || 'Organizer applicant',
          email: account.email.trim(),
          subject: `Organizer application — ${(app.org.trim() || 'applicant').slice(0, 60)}`,
          entity_type: 'organizer',
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
        <img src={src} alt="Equestrian event" loading="eager" fetchPriority="high" />
        <div className="login-visual-top">
          <Link href="/" className="wordmark inverted">BOSS<span>MEDIA</span></Link>
          <Link href="/">Back to home</Link>
        </div>
        <div className="login-quote">
          <p>Run the show. We’ll handle the shop.</p>
          <span>Earn on every photo sold at your events.</span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">Contributors / Organizers</p>
          <h1>{sent ? 'Application sent.' : 'Run events with us.'}</h1>
          {!sent && (
            <p className="login-intro">
              {step === 1
                ? 'First create your free account — organizer access is approved by our team after review.'
                : 'Now tell us about your events. We review every application personally.'}
            </p>
          )}

          {checking ? (
            <p className="empty-note" role="status">Checking your session…</p>
          ) : sent ? (
            <div className="auth-card">
              <p className="eyebrow">What happens next</p>
              <p>Thanks, {account.name.trim().split(' ')[0] || 'organizer'} — your application is with our team.</p>
              <ul>
                <li>We review applications personally and reply by email.</li>
                <li>Approved organizers get an event dashboard and a revenue share on every photo sold.</li>
                <li>You can grant balance to your volunteers straight from the dashboard.</li>
              </ul>
              <p className="btn-row">
                <Link href="/" className="btn-light">Back to home</Link>
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
                <span className="done"><span className="auth-step-n">✓</span>Account</span>
                <span className="active"><span className="auth-step-n">2</span>Application</span>
              </div>
              <label><span>Organization / show name</span>
                <input required type="text" value={app.org} onChange={(e) => setApp({ ...app, org: e.target.value })}
                  placeholder="e.g. Brookby Show Jumping" autoComplete="organization" />
              </label>
              <label><span>Main region</span>
                <SearchSelect options={REGIONS.map((r) => ({ id: r, label: r }))} value={app.region || null}
                  onChange={(id) => setApp({ ...app, region: id || '' })} placeholder="Select a region…" clearable={false} />
              </label>
              <label><span>Events you run</span>
                <textarea required value={app.events} onChange={(e) => setApp({ ...app, events: e.target.value })}
                  placeholder="Which shows and seasons? e.g. two-day SJ series across Waikato, Dec–Mar…" rows={4} />
              </label>
              <label><span>Contact <em className="auth-opt">(optional)</em></span>
                <input type="text" value={app.contact} onChange={(e) => setApp({ ...app, contact: e.target.value })}
                  placeholder="Phone or best contact" autoComplete="off" />
              </label>
              <label className="auth-check">
                <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                <span className="auth-box" aria-hidden="true">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4 12.5 5 5L20 6.5" />
                  </svg>
                </span>
                <span>I run (or help run) equestrian events and agree to the organizer terms in the <Link href="/terms">Terms</Link>.</span>
              </label>
              {hasAccount && (
                <p className="auth-note">
                  Applying as {account.name.trim()} ({account.email.trim()})
                </p>
              )}
              {err && <p className="auth-error" role="alert">{err}</p>}
              <button type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send application'}
                <Icon name="arrow" size={18} />
              </button>
              {hasAccount && (
                <p className="auth-note">
                  <button type="button" className="st-link" style={{ background: 'none', border: 0, borderBottom: '1px solid #555', padding: 0, paddingBottom: 3, color: '#aaa', fontSize: 12, cursor: 'pointer' }}
                    onClick={() => router.push('/')}>
                    ← Back to home instead
                  </button>
                </p>
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
          <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        </footer>
      </section>
    </main>
  );
}

export default function OrganizerRegisterClient({ visual }) {
  return (
    <Suspense>
      <OrganizerInner visual={visual} />
    </Suspense>
  );
}
