'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { API } from '../../../../lib/api';
import { CARD, H1, SUB, INP, BTN_PRIMARY } from '../../../../lib/tokens';

const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024;
const OK_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
];
const STEPS = ['Upload drafts', 'Tag in library', 'Publish'];

const fmtMB = (b) => `${(b / 1048576).toFixed(1)} MB`;

function UploadIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function FilmIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4" />
    </svg>
  );
}

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
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
  }, []);

  // Revoke preview URLs when files change / unmount.
  useEffect(() => {
    const urls = files.map((f) => f.preview).filter(Boolean);
    return () => urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
  }, [files]);

  function addFiles(list) {
    setMsg('');
    const kept = [];
    for (const f of (list || [])) {
      if (!OK_TYPES.includes(f.type)) {
        setMsg(`"${f.name}" was skipped — supported formats are JPG, PNG, WebP and MP4.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setMsg(`"${f.name}" was skipped — file size is ${fmtMB(f.size)} (limit 15 MB).`);
        continue;
      }
      kept.push(f);
    }
    setFiles((prev) => {
      if (prev.length + kept.length > MAX_FILES) {
        setMsg(`A maximum of ${MAX_FILES} files per upload — keeping the first ${MAX_FILES}.`);
      }
      return [...prev, ...kept].slice(0, MAX_FILES).map((f) => (
        f.preview || !f.type.startsWith('image/')
          ? f
          : Object.assign(f, { preview: URL.createObjectURL(f) })
      ));
    });
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function upload() {
    if (!files.length) { setMsg('Choose files first — drag them into the drop zone or browse.'); return; }
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

  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);
  const selectedEvent = events.find((e) => e.id === eventId);

  return (
    <>
      <h1 className={H1}>Upload photos</h1>
      <p className={SUB}>Files land as drafts — nothing goes public until you tag and publish them.</p>

      {/* step indicator */}
      <ol className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px]" aria-label="Upload progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span aria-current={i === 0 ? 'step' : undefined}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold ${i === 0 ? 'bg-gold text-black' : 'border border-line text-faint'}`}>{i + 1}</span>
            <span className={i === 0 ? 'text-white font-bold' : 'text-muted'}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 text-faint" aria-hidden="true">→</span>}
          </li>
        ))}
      </ol>

      {msg && <section className={CARD} role="alert"><p className="text-sm text-gold">{msg}</p></section>}

      <section className={CARD}>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event (optional — can tag later)
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={INP}>
              <option value="">Unsorted (tag later)</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>

          {/* drop zone */}
          <div
            role="button" tabIndex={0}
            aria-label="Add files: drag and drop, or press Enter to browse"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer?.files); }}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition focus:outline-none focus:border-gold/70 ${dragging ? 'border-gold bg-goldbg/30' : 'border-line hover:border-gold/50'}`}
          >
            <UploadIcon className={`mx-auto h-8 w-8 ${dragging ? 'text-gold' : 'text-faint'}`} />
            <div className="mt-2 text-[14px] font-bold text-white">
              {dragging ? 'Drop files to add them' : 'Drag & drop photos or video'}
            </div>
            <div className="mt-0.5 text-[12.5px] text-muted">
              or <span className="text-gold underline underline-offset-2">browse files</span>
              <span className="mx-1.5 text-faint">·</span>JPG / PNG / WebP / MP4
              <span className="mx-1.5 text-faint">·</span>≤ 15 MB each
              <span className="mx-1.5 text-faint">·</span>max {MAX_FILES} files
            </div>
            <input ref={fileRef} type="file" multiple className="hidden"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {/* staging list */}
          {!!files.length && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-muted">
                <span>
                  <b className="text-white">{files.length}</b> file{files.length > 1 ? 's' : ''} staged
                  <span className="mx-1.5 text-faint">·</span>{fmtMB(totalBytes)} total
                  {selectedEvent && (<><span className="mx-1.5 text-faint">·</span>to {selectedEvent.name}</>)}
                </span>
                <button onClick={() => setFiles([])} className="text-faint hover:text-blood bg-none border-0 cursor-pointer text-[12.5px]">Clear all</button>
              </div>
              <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 list-none m-0 p-0">
                {files.map((f, i) => (
                  <li key={`${f.name}-${f.size}-${i}`} className="group relative overflow-hidden rounded-lg border border-line bg-ink">
                    {f.preview
                      ? <img src={f.preview} alt="" className="h-20 w-full object-cover" />
                      : (
                        <div className="flex h-20 flex-col items-center justify-center gap-1 text-faint">
                          <FilmIcon className="h-6 w-6" />
                          <span className="text-[10px] uppercase tracking-wide">Video</span>
                        </div>
                      )}
                    <button title={`Remove ${f.name}`} aria-label={`Remove ${f.name}`} onClick={() => removeFile(i)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[12px] leading-none text-white opacity-0 group-hover:opacity-100 focus:opacity-100 border-0 cursor-pointer">×</button>
                    <div className="px-1.5 py-1">
                      <div className="truncate text-[10.5px] text-muted" title={f.name}>{f.name}</div>
                      <div className="text-[10px] text-faint tabular-nums">{fmtMB(f.size)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <button onClick={upload} disabled={busy || !files.length} className={BTN_PRIMARY}>
              {busy ? `Uploading ${files.length} file${files.length > 1 ? 's' : ''}…` : `Upload${files.length ? ` ${files.length} file${files.length > 1 ? 's' : ''} as draft${files.length > 1 ? 's' : ''}` : ' drafts'}`}
            </button>
          </div>
        </div>
      </section>

      {!!done && (
        <section className={CARD} role="status">
          <h2 className="text-[15px] font-bold mb-2">Uploaded {done.ok} of {done.total} as drafts</h2>
          {!!done.bad.length && (
            <ul className="text-[13px] text-blood mb-3 list-disc ml-5">
              {done.bad.map((x, i) => <li key={i}>{x.file}: {x.error}</li>)}
            </ul>
          )}
          <div className="flex gap-3">
            <button onClick={() => router.push(`/admin/media${eventId ? `?event=${eventId}` : ''}`)} className={BTN_PRIMARY}>
              Continue to library → tag & publish
            </button>
            <Link href="/admin/media" className="text-sky text-sm self-center no-underline hover:underline">Library</Link>
          </div>
          <p className="text-[12px] text-faint mt-2">Step 2: tick the new drafts, pick horse & rider, Apply. Step 3: publish.</p>
        </section>
      )}
    </>
  );
}
