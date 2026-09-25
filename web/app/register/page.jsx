'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth';
import { CARD, H1, SUB, INP, BTN_PRIMARY, LINK } from '../../lib/tokens';

const ROLES = [
  ['PUBLIC', 'Supporter — follow horses, riders & rankings'],
  ['RIDER', 'Rider — claim your rider profile & form'],
  ['COACH', 'Coach — manage a roster of athletes'],
];

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', password2: '', role: 'PUBLIC' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (form.password !== form.password2) { setErr('Passwords do not match.'); return; }
    if (form.password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try { await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role }); router.push('/watchlist'); router.refresh(); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  }
  return (
    <>
      <h1 className={H1}>Create account</h1>
      <p className={SUB}>One account for watchlists, comparisons and — for riders & coaches — verified profiles.</p>
      <section className={CARD} style={{ maxWidth: 460 }}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-xs text-muted flex flex-col gap-1">Name
            <input className={INP} required maxLength={100} autoComplete="name" value={form.name} onChange={set('name')} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Email
            <input className={INP} type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">I am a…
            <select className={INP} value={form.role} onChange={set('role')}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></label>
          <label className="text-xs text-muted flex flex-col gap-1">Password (min 8 chars)
            <input className={INP} type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Confirm password
            <input className={INP} type="password" required autoComplete="new-password" value={form.password2} onChange={set('password2')} /></label>
          {err && <p className="text-blood text-sm">{err}</p>}
          <button className={BTN_PRIMARY} disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <p className="text-muted text-sm mt-3">Have an account? <a className={LINK} href="/login">Log in →</a></p>
      </section>
    </>
  );
}
