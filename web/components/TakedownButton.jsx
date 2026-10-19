'use client';
import { useState } from 'react';
import { API } from '../lib/api';
import { INP } from '../lib/tokens';
import { useAuth } from './auth';

// Takedown request (P3 privacy): withdrawing consent always works.
// Sends a tracked request to the admin triage (48h SLA per privacy page);
// the admin archives the photo and resolves the report.
export default function TakedownButton({ mediaId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    if (busy) return;
    setMsg(''); setBusy(true);
    try {
      const res = await fetch(`${API}/api/media/${mediaId}/takedown`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Log in to request takedown.');
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setDone(true);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  if (done) {
    return <p className="mt-2 text-[12.5px] text-moss">✓ Takedown requested — we review within 48 hours.</p>;
  }
  if (!open) {
    return (
      <button onClick={() => user ? setOpen(true) : setMsg('Log in to request takedown.')}
        className="mt-2 text-[12.5px] text-faint hover:text-blood bg-none border-0 cursor-pointer p-0">
        Don&apos;t want this photo up? Request takedown →
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-line bg-card2 p-2.5">
      <div className="text-[12px] font-bold text-white mb-1.5">Why should this come down? (optional)</div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. that's my child, please remove"
        className={`${INP} w-full !text-[13px]`} maxLength={500} />
      {msg && <p className="text-blood text-[12px] mt-1.5">{msg}</p>}
      <div className="flex gap-2 mt-2">
        <button onClick={submit} disabled={busy} className="bg-blood text-white font-bold rounded px-3 py-1.5 text-[12.5px] hover:brightness-110">
          {busy ? 'Sending…' : 'Request takedown'}
        </button>
        <button onClick={() => { setOpen(false); setMsg(''); }} className="text-faint text-[12.5px] bg-none border-0 cursor-pointer hover:text-white">Cancel</button>
      </div>
      <p className="mt-1.5 text-[11px] text-faint">Reviewed within 48 hours. Buyers keep files they already paid for.</p>
    </div>
  );
}
