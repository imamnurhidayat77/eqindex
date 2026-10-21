'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { API } from '../../lib/api';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/media';
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!form.email.trim() || !form.password) { setErr('Enter your email and password.'); return; }
    if (mode === 'register' && form.password.length < 8) { setErr('Password needs at least 8 characters.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/${mode}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register'
          ? { name: form.name.trim() || form.email.split('@')[0], email: form.email.trim(), password: form.password }
          : { email: form.email.trim(), password: form.password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'That didn’t work — check your details and try again.');
      router.push(next);
    } catch (e2) { setErr(e2.message); setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0, borderRadius: 16, overflow: 'hidden', border: '1px solid #E7E2D8', background: '#fff' }}>
      <div style={{ padding: 36 }}>
        <h1 className="display" style={{ fontSize: 36, margin: '0 0 6px' }}>
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="caption" style={{ margin: '0 0 20px' }}>One account for purchases, reels, and credits.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {['login', 'register'].map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setErr(''); }}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                border: mode === m ? '1px solid #1F3D2E' : '1px solid #E7E2D8',
                background: mode === m ? '#1F3D2E' : '#fff', color: mode === m ? '#fff' : '#1C1C1A' }}>
              {m === 'login' ? 'Log in' : 'Register'}
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <div className="field"><label htmlFor="bm-name">Name</label>
              <input id="bm-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" autoComplete="name" />
            </div>
          )}
          <div className="field"><label htmlFor="bm-email">Email</label>
            <input id="bm-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.nz" autoComplete="email" />
          </div>
          <div className="field"><label htmlFor="bm-pass">Password</label>
            <input id="bm-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            {mode === 'register' && form.password && (
              <div className="caption">Strength: {form.password.length >= 12 ? 'strong' : form.password.length >= 8 ? 'okay' : 'too short'}</div>
            )}
          </div>
          {mode === 'register' && (
            <label style={{ display: 'flex', gap: 8, fontSize: 13, margin: '4px 0 12px', cursor: 'pointer' }}>
              <input type="checkbox" required style={{ marginTop: 4 }} />
              <span>I agree to the <Link href="/terms" style={{ color: '#1F3D2E' }}>Terms</Link> and <Link href="/privacy" style={{ color: '#1F3D2E' }}>Privacy policy</Link>.</span>
            </label>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary btn-lg" style={{ width: '100%' }}>
            {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
      <div style={{ background: '#1C1C1A', color: '#F6F6F4', padding: 36, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p className="display" style={{ fontSize: 30, margin: 0 }}>Riders and Horses. Elevated.</p>
        <p style={{ color: '#B9B9B4', fontSize: 14, marginTop: 10 }}>Boss Media creates cinematic content for the New Zealand equestrian industry, focused on the riders, horses, and teams behind the result.</p>
      </div>
    </div>
  );
}
