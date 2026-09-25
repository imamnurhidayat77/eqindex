'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../components/auth';
import { CARD, H1, SUB, INP, BTN_PRIMARY, LINK } from '../../lib/tokens';

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/watchlist';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(email.trim(), password); router.push(next); router.refresh(); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  }
  return (
    <>
      <h1 className={H1}>Log in</h1>
      <p className={SUB}>Welcome back to EQIndex intelligence.</p>
      <section className={CARD} style={{ maxWidth: 420 }}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-xs text-muted flex flex-col gap-1">Email
            <input className={INP} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Password
            <input className={INP} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {err && <p className="text-blood text-sm">{err}</p>}
          <button className={BTN_PRIMARY} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        </form>
        <p className="text-muted text-sm mt-3">No account? <a className={LINK} href="/register">Register →</a></p>
      </section>
    </>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
