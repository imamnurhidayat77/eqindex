'use client';
// Follow + report actions for a community moment. No cart, no price, no
// download — viewing and notifying are the whole product here.
import Link from 'next/link';
import { useState } from 'react';
import { API } from '../lib/api';
import { useToast } from './Toaster';
import FollowButton from './FollowButton';
import m from './MomentsActions.module.css';

export default function MomentsActions({ id, horseId, riderId, horse, rider, eventId, eventName }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);

  async function report(e) {
    e.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/media/${id}/takedown`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim().slice(0, 500) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Couldn’t send — try again.');
      setReported(true);
      toast('Thanks — our team will review this moment.', { type: 'success' });
    } catch (e2) { toast(e2.message, { type: 'error' }); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {eventId && <FollowButton kind="event" id={eventId} name={eventName} />}
        {riderId && <FollowButton kind="rider" id={riderId} name={rider} />}
        {horseId && <FollowButton kind="horse" id={horseId} name={horse} />}
        {!riderId && !horseId && (
          <small style={{ color: '#888' }}>Follow riders and horses from tagged moments to get notified.</small>
        )}
      </div>
      {reported ? (
        <p className="empty-note">Reported — thanks for keeping the gallery safe.</p>
      ) : (
        <details>
          <summary className={m.toggle}>Report this moment</summary>
          <form onSubmit={report} className={m.form}>
            <label>What’s wrong?
              <input type="text" className={m.field} value={reason} maxLength={500}
                onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong rider tagged" />
            </label>
            <p className={m.row}><button type="submit" className="st-btn-ghost" disabled={busy || !reason.trim()}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
            <small><Link href="/takedown" className={m.policy}>Removal policy</Link></small></p>
          </form>
        </details>
      )}
    </div>
  );
}
