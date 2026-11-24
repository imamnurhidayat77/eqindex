'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { API } from '../lib/api';
import { safeError } from '../lib/errors';
import { resetMe } from '../lib/use-authed';

export default function VerifyEmailClient() {
  const token = useSearchParams().get('token') || '';
  const [state, setState] = useState(token ? 'checking' : 'error');
  const [err, setErr] = useState(token ? '' : 'This link is missing its token. Request a new one from My account.');
  const sent = useRef(false);

  useEffect(() => {
    // Single-use token: never post it twice (strict-mode double effect).
    if (!token || sent.current) return;
    sent.current = true;
    fetch(`${API}/auth/verify-email`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'This link is invalid or expired. Request a new one.');
        resetMe(undefined);
        setState('done');
      })
      .catch((e) => { setErr(safeError(e.message)); setState('error'); });
  }, [token]);

  if (state === 'checking') return <p className="empty-note" role="status">Confirming…</p>;
  if (state === 'done') {
    return (
      <div role="status">
        <p>Thanks, your email is confirmed. Guest purchases made with it now join your account.</p>
        <p style={{ marginTop: 18 }}><Link href="/media" className="text-link">Open my media</Link></p>
      </div>
    );
  }
  return (
    <div role="alert">
      <p>{err}</p>
      <p style={{ marginTop: 18 }}><Link href="/account" className="text-link">Go to my account</Link></p>
    </div>
  );
}
