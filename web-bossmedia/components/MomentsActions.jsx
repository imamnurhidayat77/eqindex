'use client';
// Actions for a community moment: share (sponsors pay first), follow,
// report. Free to view; only sponsors pay.
import Link from 'next/link';
import { useState } from 'react';
import { API } from '../lib/api';
import { useToast } from './Toaster';
import FollowButton from './FollowButton';
import MomentShareActions from './MomentShareActions';
import { momentTitle } from '../lib/moment-share.mjs';
import m from './MomentsActions.module.css';

export default function MomentsActions({ id, horseId, riderId, horse, rider, eventId, eventName, kind, thumb, children }) {
  const who = momentTitle({ rider, horse });
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

  // Sidebar groups: Share, Get notified, details (children), then Report as
  // a quiet link at the very bottom.
  return (
    <div className={m.groups}>
      <section className={m.group} aria-labelledby="moment-share">
        <h2 id="moment-share" className="purchase-label">Share</h2>
        <MomentShareActions kind={kind} media={{
          media_id: id,
          thumb: thumb || null,
          title: who,
          sub: eventName || '',
          caption: `${who}${eventName ? ` at ${eventName}` : ''} via BossMedia`,
        }} />
      </section>
      <section className={m.group} aria-labelledby="moment-follow">
        <h2 id="moment-follow" className="purchase-label">Get notified</h2>
        <div className={m.follows}>
          {eventId && <FollowButton kind="event" id={eventId} name={eventName} showName />}
          {riderId && <FollowButton kind="rider" id={riderId} name={rider} showName />}
          {horseId && <FollowButton kind="horse" id={horseId} name={horse} showName />}
        </div>
        {!riderId && !horseId && (
          <small className={m.hint}>Follow riders and horses from tagged moments to get notified.</small>
        )}
      </section>
      {children && <div className={m.group}>{children}</div>}
      {reported ? (
        <p className="empty-note">Reported — thanks for keeping the gallery safe.</p>
      ) : (
        <details className={m.report}>
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
