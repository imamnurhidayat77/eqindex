'use client';
import { useState } from 'react';
import { useAuth } from './auth';
import Switch from './Switch';

// Privacy opt-out control (migration 031).
// - Everyone sees the 🔒 badge when the entity is anonymous.
// - Only the verified owner (rider.user_id / horse.owner_id) or an ADMIN
//   sees the toggle. Results stay counted either way.
export default function VisibilityToggle({ kind, id, ownerUserId, initial = 'public' }) {
  const { user } = useAuth();
  const [vis, setVis] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canEdit = !!user && (user.role === 'ADMIN' || (ownerUserId && user.id === ownerUserId));
  async function set(v) {
    if (busy || v === vis) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/${kind}s/${id}/visibility`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: v }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setVis(body.visibility || v);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  const isPublic = vis !== 'anonymous';
  return (
    <span className="inline-flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-2">
        {!isPublic && (
          <span className="inline-block text-[11px] font-bold rounded-full px-2 py-[3px] border border-gold/50 text-gold"
            title="Name withheld on request — results still count toward rankings">
            🔒 Private
          </span>
        )}
        {canEdit && (
          <>
            <Switch
              on={isPublic} onFlip={() => set(isPublic ? 'anonymous' : 'public')}
              label={isPublic ? 'Name shown publicly (switch to hide)' : 'Name hidden (switch to show)'}
              disabled={busy} size="sm"
            />
            <span className={`text-[11px] font-bold ${isPublic ? 'text-moss' : 'text-faint'}`}>
              {busy ? 'Saving…' : isPublic ? 'Public' : 'Hidden'}
            </span>
          </>
        )}
      </span>
      {err && <span className="text-[11px] text-blood">{err}</span>}
    </span>
  );
}
