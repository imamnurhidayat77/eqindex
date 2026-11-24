'use client';
import Link from 'next/link';
import { useState } from 'react';
import { API } from '../../lib/api';
import { H1, INP, BTN_PRIMARY, LINK } from '../../lib/tokens';

// Same account system as Boss Media: POST /auth/forgot emails a one-hour
// reset link. The API answers ok whether or not the email exists, so this
// page never reveals who has an account.
export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch(`${API}/auth/forgot`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setSent(true);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto w-full max-w-[440px] rounded-lg border border-line bg-card p-6 sm:p-8">
      <h1 className={H1}>Reset your password</h1>
      {sent ? (
        <>
          <p className="text-muted text-sm mt-2">
            If <b className="text-body">{email.trim()}</b> has an account, a reset link is on its way.
            It works for one hour. Check your spam folder if it doesn&apos;t arrive in a few minutes.
          </p>
          <p className="text-sm mt-5"><Link className={LINK} href="/login">← Back to log in</Link></p>
        </>
      ) : (
        <>
          <p className="text-muted text-sm mt-1 mb-5">
            Enter the email you signed up with. EQIndex and Boss Media use the same login.
          </p>
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <label className="text-xs text-muted flex flex-col gap-1.5">Email address
              <input className={`${INP} py-2.5`} type="email" required autoComplete="email" autoFocus
                placeholder="you@stable.co.nz" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {err && <p role="alert" className="rounded-md border border-blood/40 bg-redbg/40 px-3 py-2 text-blood text-[13px]">{err}</p>}
            <button className={`${BTN_PRIMARY} py-2.5 mt-1`} disabled={busy}>{busy ? 'Sending…' : 'Email me a reset link'}</button>
          </form>
          <p className="text-muted text-sm mt-4 text-center"><Link className={LINK} href="/login">← Back to log in</Link></p>
        </>
      )}
    </div>
  );
}
