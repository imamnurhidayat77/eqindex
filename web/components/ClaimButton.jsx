'use client';
import { useState } from 'react';
import { API } from '../lib/api';
import { INP } from '../lib/tokens';
import { useAuth } from './auth';
import EntityPicker from './EntityPicker';

// "That's me" claim (P1b): personal shelf, never touches canonical tags.
// Pick who you are and the photo is saved into YOUR gallery (library
// "Claimed" section) so you can find and buy it. No verification, no
// visibility change, no ownership change.
export default function ClaimButton({ mediaId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [horse, setHorse] = useState(null);
  const [rider, setRider] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [tagged, setTagged] = useState('');

  async function submit() {
    if (busy) return;
    setMsg('');
    if (!!horse === !!rider) { setMsg('Pick exactly one: the horse or the rider in this photo.'); return; }
    setBusy(true);
    try {
      const body = {};
      if (horse) body.horse_id = horse.id;
      if (rider) body.rider_id = rider.id;
      const res = await fetch(`${API}/api/media/${mediaId}/claim`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Log in to claim a tag.');
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      setTagged(j.data?.name || 'Tagged');
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  if (tagged) {
    return <p className="mt-2 text-[12.5px] text-moss">✓ Saved as {tagged} — find it under My photos → Claimed.</p>;
  }
  if (!open) {
    return (
      <button onClick={() => user ? setOpen(true) : setMsg('Log in to claim this photo.')}
        className="mt-2 text-[12.5px] text-faint hover:text-gold bg-none border-0 cursor-pointer p-0">
        That&apos;s me / my horse? Save to my gallery →
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-line bg-card2 p-2.5">
      <div className="text-[12px] font-bold text-white mb-2">Save this photo as…</div>
      <div className="grid gap-2">
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Horse
          <EntityPicker kind="horse" value={horse} onPick={(h) => { setHorse(h); setRider(null); }} placeholder="Pick horse…" /></label>
        <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Rider
          <EntityPicker kind="rider" value={rider} onPick={(r) => { setRider(r); setHorse(null); }} placeholder="Pick rider…" /></label>
      </div>
      {msg && <p className="text-blood text-[12px] mt-1.5">{msg}</p>}
      <div className="flex gap-2 mt-2">
        <button onClick={submit} disabled={busy} className="bg-gold text-black font-bold rounded px-3 py-1.5 text-[12.5px] hover:brightness-110">
          {busy ? 'Saving…' : 'Save to my gallery'}
        </button>
        <button onClick={() => { setOpen(false); setMsg(''); }} className="text-faint text-[12.5px] bg-none border-0 cursor-pointer hover:text-white">Cancel</button>
      </div>
    </div>
  );
}
