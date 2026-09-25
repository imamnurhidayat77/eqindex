'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../components/auth';
import { INP, BTN_PRIMARY, LINK } from '../../lib/tokens';

function LoginForm() {
  const { user, loading, login, logout } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/watchlist';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(email.trim(), password); router.push(next); router.refresh(); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  }
  if (!loading && user) {
    return (
      <div className="mx-auto w-full max-w-[520px] rounded border border-line bg-card p-6 sm:p-8 text-center">
        <h1 className="font-display text-[24px] font-bold uppercase tracking-tight">Already logged in</h1>
        <p className="text-muted text-sm mt-2 mb-5">
          You are logged in as <b className="text-body">{user.name}</b> ({user.email}).
          Log out first to switch accounts.
        </p>
        <button
          onClick={async () => { await logout(); router.refresh(); }}
          className="border border-blood/60 text-blood rounded px-5 py-2.5 text-sm font-bold hover:bg-redbg/40"
        >
          Log out {user.name.split(' ')[0]} →
        </button>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[880px] grid md:grid-cols-2 overflow-hidden rounded border border-line bg-card">
      {/* brand panel */}
      <div className="hidden md:flex flex-col justify-between bg-gold p-8 text-black">
        <div>
          <div className="font-display text-[26px] font-bold uppercase tracking-tight">EQIndex</div>
          <p className="mt-1 text-[13px] font-semibold uppercase tracking-wide opacity-70">New Zealand show jumping rankings</p>
        </div>
        <div className="space-y-3 text-[14px] font-semibold">
          <div className="border-l-4 border-black/70 pl-3">Placing-based points, updated weekly</div>
          <div className="border-l-4 border-black/40 pl-3">Horse, rider & combination intelligence</div>
          <div className="border-l-4 border-black/40 pl-3">Watchlists, forecasts & comparisons</div>
        </div>
        <p className="text-[11px] opacity-60">© 2026 EQIndex Platforms Ltd.</p>
      </div>
      {/* form panel */}
      <div className="p-6 sm:p-8">
        <h1 className="font-display text-[24px] font-bold uppercase tracking-tight">Welcome back</h1>
        <p className="text-muted text-sm mt-1 mb-5">Log in to your stable intelligence.</p>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <label className="text-xs text-muted flex flex-col gap-1.5">Email address
            <input className={`${INP} py-2.5`} type="email" required autoComplete="email"
              placeholder="you@stable.co.nz" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1.5">Password
            <span className="relative block">
              <input className={`${INP} py-2.5 w-full pr-14`} type={show ? 'text' : 'password'} required
                autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-faint hover:text-white bg-none border-0 cursor-pointer">
                {show ? 'Hide' : 'Show'}</button>
            </span></label>
          {err && <p className="rounded border border-blood/40 bg-redbg/40 px-3 py-2 text-blood text-[13px]">{err}</p>}
          <button className={`${BTN_PRIMARY} py-2.5 mt-1`} disabled={busy}>{busy ? 'Logging in…' : 'Log in →'}</button>
        </form>
        <p className="text-muted text-sm mt-4 text-center">New to EQIndex? <a className={LINK} href="/register">Create an account →</a></p>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <div className="py-6 md:py-10">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
