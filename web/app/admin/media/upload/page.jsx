'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API } from '../../../../lib/api';
import { CARD, H1, SUB, INP, BTN_PRIMARY } from '../../../../lib/tokens';

// Upload only — after upload you land on the library filtered to the
// new drafts, where tagging happens.
export default function AdminMediaUpload() {
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
  }, []);

  async function upload() {
    if (!files.length) { setMsg('Pick files first.'); return; }
    setBusy(true); setMsg(''); setDone(null);
    try {
      const fd = new FormData();
      if (eventId) fd.append('event_id', eventId);
      for (const f of files) fd.append('files', f);
      const res = await fetch(`${API}/admin/media/upload`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      const ok = (j.data || []).filter((x) => x.ok);
      const bad = (j.data || []).filter((x) => !x.ok);
      setDone({ ok: ok.length, total: (j.data || []).length, bad });
      setFiles([]);
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className={H1}>Upload photos</h1>
      <p className={SUB}>Step 1 of 3 — files land as drafts. Tagging happens next, in the library.</p>
      {msg && <section className={CARD}><p className="text-sm text-gold">{msg}</p></section>}

      <section className={CARD}>
        <div className="grid gap-2.5 max-w-[560px]">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={INP}>
              <option value="">Unsorted (tag later)</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Files (≤15MB each, ≤20 — JPG/PNG/WebP/MP4)
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              onChange={(e) => setFiles([...e.target.files])} className="text-sm text-muted" /></label>
          {!!files.length && (
            <p className="text-[13px] text-muted">{files.length} files · {(files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1)} MB total</p>
          )}
          <div>
            <button onClick={upload} disabled={busy || !files.length} className={BTN_PRIMARY}>
              {busy ? 'Uploading…' : `Upload ${files.length ? `(${files.length})` : ''}`}
            </button>
          </div>
        </div>
      </section>

      {!!done && (
        <section className={CARD}>
          <h2 className="text-[15px] font-bold mb-2">Uploaded {done.ok}/{done.total}</h2>
          {!!done.bad.length && (
            <ul className="text-[13px] text-blood mb-3 list-disc ml-5">
              {done.bad.map((x, i) => <li key={i}>{x.file}: {x.error}</li>)}
            </ul>
          )}
          <div className="flex gap-3">
            <button onClick={() => router.push(`/admin/media${eventId ? `?event=${eventId}` : ''}`)} className={BTN_PRIMARY}>
              Continue to library →
            </button>
            <Link href="/admin/media" className="text-sky text-sm self-center no-underline hover:underline">Library</Link>
          </div>
          <p className="text-[12px] text-faint mt-2">Next: tick the new drafts, pick horse & rider, Apply, then publish.</p>
        </section>
      )}
    </>
  );
}
