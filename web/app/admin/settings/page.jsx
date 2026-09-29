'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { API } from '../../../lib/api';
import { CARD, H1, H2, SUB, INP, BTN_PRIMARY, LINK } from '../../../lib/tokens';
import { EmptyState } from '../../../components/EmptyState';
import Switch from '../../../components/Switch';

const CLASS_TYPES = ['Grand Prix', 'Premier', 'Open', 'Standard', 'Young Horse', 'Amateur', 'Pony'];

export default function AdminSettings() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [vis, setVis] = useState(null);
  const [visErr, setVisErr] = useState('');
  const [visMsg, setVisMsg] = useState('');
  const [visBusy, setVisBusy] = useState(false);
  const [off, setOff] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/admin/visibility`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Failed (${res.status})`);
        const j = await res.json();
        setVis(j.data);
        setOff(j.data.excluded_class_types || []);
      } catch (e) { setVisErr(e.message); }
    })();
  }, []);
  async function saveVis(e) {
    e.preventDefault();
    setVisErr(''); setVisMsg(''); setVisBusy(true);
    try {
      const res = await fetch(`${API}/admin/visibility`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded_class_types: off }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setVisMsg(off.length
        ? `${off.join(', ')} excluded from all rankings & analytics. Applies within ~60s; rounds stay in the DB.`
        : 'All class categories tracked.');
      const r2 = await fetch(`${API}/admin/visibility`, { credentials: 'include' });
      if (r2.ok) setVis((await r2.json()).data);
    } catch (e2) { setVisErr(e2.message); }
    setVisBusy(false);
  }
  async function changePw(e) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (next !== next2) { setErr('New passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/auth/password`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: cur, next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setMsg('Password changed — all sessions revoked. Please log in again.');
      setCur(''); setNext(''); setNext2('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <>
      <h1 className={H1}>Settings</h1>
      <p className={SUB}>Workspace security and session control.</p>
      {err && <section className={CARD}><p className="text-blood text-sm">{err}</p></section>}
      {msg && <section className={CARD}><p className="text-moss text-sm">{msg}</p></section>}
      <section className={CARD} style={{ maxWidth: 460 }}>
        <h2 className={H2}>Change password</h2>
        <form onSubmit={changePw} className="flex flex-col gap-3 mt-2">
          <label className="text-xs text-muted flex flex-col gap-1">Current password
            <input className={INP} type="password" required autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">New password (min 8 chars)
            <input className={INP} type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <label className="text-xs text-muted flex flex-col gap-1">Confirm new password
            <input className={INP} type="password" required autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} /></label>
          <button className={BTN_PRIMARY} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        </form>
      </section>
      <section className={CARD}>
        <h2 className={H2}>Tracked class categories</h2>
        <p className="text-muted text-sm mt-1 mb-3">
          Switch a whole category off (e.g. Pony) to exclude it from rankings, trends and analytics.
          Rounds stay in the DB and keep their audit trail. Per-class switches live under{' '}
          <Link className={LINK} href="/admin/classes">Admin → Classes</Link>.
          {vis && vis.inactive_classes > 0 && (
            <> <b className="text-gold">{vis.inactive_classes} classes</b> are also switched off individually.</>
          )}
        </p>
        {visErr && <p className="text-blood text-sm mb-2">{visErr}</p>}
        {visMsg && <p className="text-moss text-sm mb-2">{visMsg}</p>}
        {!vis && !visErr ? (
          <span className="flex flex-col gap-2 py-1" aria-label="Loading">
            {[0, 1].map((i) => <span key={i} className="sk h-9 w-full" />)}
          </span>
        ) : vis ? (
          <form onSubmit={saveVis}>
            <div className="mb-3 rounded border border-line overflow-hidden">
              {CLASS_TYPES.map((t, i) => {
                const n = (vis.by_type || []).find((x) => x.class_type === t);
                const isOff = off.includes(t);
                return (
                  <div key={t} className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? 'border-t border-rowline' : ''}`}>
                    <Switch
                      on={!isOff}
                      onFlip={() => setOff(isOff ? off.filter((x) => x !== t) : [...off, t])}
                      label={`${t} tracked`}
                    />
                    <div className="min-w-0">
                      <div className={`text-[13px] font-semibold ${isOff ? 'text-faint' : ''}`}>{t}</div>
                      <div className="text-[11px] text-faint">
                        {n ? `${n.classes} classes · ${Number(n.rounds).toLocaleString()} rounds` : 'No classes yet'}
                      </div>
                    </div>
                    <span className={`ml-auto text-[11px] font-bold ${isOff ? 'text-blood' : 'text-moss'}`}>
                      {isOff ? 'OFF' : 'ON'}
                    </span>
                  </div>
                );
              })}
            </div>
            <button className={BTN_PRIMARY} disabled={visBusy}>{visBusy ? 'Saving…' : 'Save category switches'}</button>
          </form>
        ) : (
          <EmptyState icon="⚙" title="Visibility settings unavailable" hint="Reload the page or check the API connection." compact />
        )}
      </section>
    </>
  );
}
