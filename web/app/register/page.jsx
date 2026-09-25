'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/auth';
import { INP, BTN_PRIMARY, LINK } from '../../lib/tokens';

const ROLES = [
  ['PUBLIC', 'Supporter', 'Follow horses, riders & rankings'],
  ['RIDER', 'Rider', 'Claim your rider profile & form'],
  ['COACH', 'Coach', 'Manage a roster of athletes'],
];

export default function Register() {
  const { user, loading, register, logout } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', password2: '', role: 'PUBLIC' });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pwScore = form.password.length >= 12 ? 3 : form.password.length >= 8 ? 2 : form.password.length > 0 ? 1 : 0;
  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (form.password !== form.password2) { setErr('Passwords do not match.'); return; }
    if (form.password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role });
      router.push('/watchlist'); router.refresh();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }
  return (
    <div className="py-6 md:py-10">
      {!loading && user ? (
        <div className="mx-auto w-full max-w-[520px] rounded border border-line bg-card p-6 sm:p-8 text-center">
          <h1 className="font-display text-[24px] font-bold uppercase tracking-tight">Already logged in</h1>
          <p className="text-muted text-sm mt-2 mb-5">
            You are logged in as <b className="text-body">{user.name}</b> ({user.email}).
            Log out first to create another account.
          </p>
          <button
            onClick={async () => { await logout(); router.refresh(); }}
            className="border border-blood/60 text-blood rounded px-5 py-2.5 text-sm font-bold hover:bg-redbg/40"
          >
            Log out {user.name.split(' ')[0]} →
          </button>
        </div>
      ) : (
      <div className="mx-auto w-full max-w-[880px] grid md:grid-cols-2 overflow-hidden rounded border border-line bg-card">
        {/* brand panel */}
        <div className="hidden md:flex flex-col justify-between bg-gold p-8 text-black">
          <div>
            <div className="font-display text-[26px] font-bold uppercase tracking-tight">Join EQIndex</div>
            <p className="mt-1 text-[13px] font-semibold uppercase tracking-wide opacity-70">One account, full circuit</p>
          </div>
          <div className="space-y-3 text-[14px] font-semibold">
            <div className="border-l-4 border-black/70 pl-3">Personal watchlists & saved comparisons</div>
            <div className="border-l-4 border-black/40 pl-3">Riders verify & claim their profile</div>
            <div className="border-l-4 border-black/40 pl-3">Coaches track their whole roster</div>
          </div>
          <p className="text-[11px] opacity-60">Free for supporters. No card required.</p>
        </div>
        {/* form panel */}
        <div className="p-6 sm:p-8">
          <h1 className="font-display text-[24px] font-bold uppercase tracking-tight">Create account</h1>
          <p className="text-muted text-sm mt-1 mb-5">Start tracking the circuit in under a minute.</p>
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(([v, t, d]) => (
                <button type="button" key={v} onClick={() => setForm({ ...form, role: v })}
                  className={`rounded border p-2.5 text-left transition-colors ${form.role === v ? 'border-gold bg-goldbg' : 'border-line bg-card2 hover:border-faint'}`}>
                  <div className={`text-[13px] font-bold ${form.role === v ? 'text-gold' : 'text-white'}`}>{t}</div>
                  <div className="text-[11px] text-muted mt-0.5 leading-snug">{d}</div>
                </button>
              ))}
            </div>
            <label className="text-xs text-muted flex flex-col gap-1.5">Full name
              <input className={`${INP} py-2.5`} required maxLength={100} autoComplete="name"
                placeholder="Sophie Bennett" value={form.name} onChange={set('name')} /></label>
            <label className="text-xs text-muted flex flex-col gap-1.5">Email address
              <input className={`${INP} py-2.5`} type="email" required autoComplete="email"
                placeholder="you@stable.co.nz" value={form.email} onChange={set('email')} /></label>
            <label className="text-xs text-muted flex flex-col gap-1.5">Password
              <span className="relative block">
                <input className={`${INP} py-2.5 w-full pr-14`} type={show ? 'text' : 'password'} required
                  autoComplete="new-password" value={form.password} onChange={set('password')} />
                <button type="button" onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-faint hover:text-white bg-none border-0 cursor-pointer">
                  {show ? 'Hide' : 'Show'}</button>
              </span></label>
            {form.password.length > 0 && (
              <div className="flex gap-1">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={`h-1 flex-1 rounded ${pwScore >= i ? (pwScore === 3 ? 'bg-moss' : 'bg-gold') : 'bg-line'}`} />
                ))}
              </div>
            )}
            <label className="text-xs text-muted flex flex-col gap-1.5">Confirm password
              <input className={`${INP} py-2.5`} type="password" required autoComplete="new-password"
                value={form.password2} onChange={set('password2')} /></label>
            {err && <p className="rounded border border-blood/40 bg-redbg/40 px-3 py-2 text-blood text-[13px]">{err}</p>}
            <button className={`${BTN_PRIMARY} py-2.5 mt-1`} disabled={busy}>{busy ? 'Creating…' : 'Create account →'}</button>
          </form>
          <p className="text-muted text-sm mt-4 text-center">Have an account? <a className={LINK} href="/login">Log in →</a></p>
        </div>
      </div>
      )}
    </div>
  );
}
