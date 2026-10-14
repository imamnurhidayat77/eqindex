'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { API } from '../../../../lib/api';
import { CARD, H1, SUB, INP, BTN_PRIMARY } from '../../../../lib/tokens';
import { useAdminApi } from '../../../../components/useAdminApi';
import EntityPicker from '../../../../components/EntityPicker';

const MAX_FILES = 20;
const MAX_BYTES = 15 * 1024 * 1024;
const OK_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
];
const STEPS = ['Upload drafts', 'Tag', 'Publish'];

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

// Media Upload — all three steps on one page: 1 upload, 2 tag the new
// drafts, 3 publish. The library stays a plain table (filter/edit/delete).
export default function AdminMediaUpload() {
  const router = useRouter();
  const call = useAdminApi();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  // wizard state
  const [phase, setPhase] = useState('upload'); // upload | tag | publish | done
  const [uploadedIds, setUploadedIds] = useState([]);
  const [tagHorse, setTagHorse] = useState(null);
  const [tagRider, setTagRider] = useState(null);
  const [tagClass, setTagClass] = useState('');
  const [tagPrice, setTagPrice] = useState('');
  const [tagMoment, setTagMoment] = useState('');
  const [classes, setClasses] = useState([]);
  const [working, setWorking] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');

  useEffect(() => {
    fetch(`${API}/events?limit=100`).then((r) => r.json()).then((j) => setEvents(j.data || [])).catch(() => {});
  }, []);

  // Revoke preview URLs when files change / unmount.
  useEffect(() => {
    const urls = files.map((f) => f.preview).filter(Boolean);
    return () => urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
  }, [files]);

  // Class options follow the chosen event (for tagging + publish).
  useEffect(() => {
    if (!eventId) { setClasses([]); setTagClass(''); return; }
    fetch(`${API}/admin/media/suggest-tags`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    }).then((r) => r.json()).then((j) => setClasses(j.data || [])).catch(() => setClasses([]));
    setTagClass('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

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

  // ---- step 1: upload ----
  async function upload() {
    if (!files.length) { setMsg('Choose files first — drag them into the drop zone or browse.'); return; }
    setBusy(true); setMsg('');
    try {
      const fd = new FormData();
      if (eventId) fd.append('event_id', eventId);
      for (const f of files) fd.append('files', f);
      const res = await fetch(`${API}/admin/media/upload`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Failed (${res.status})`);
      const ok = (j.data || []).filter((x) => x.ok && x.id);
      const bad = (j.data || []).filter((x) => !x.ok);
      if (bad.length) setMsg(`Uploaded ${ok.length}/${(j.data || []).length} — ${bad[0].file}: ${bad[0].error}${bad.length > 1 ? ` (+${bad.length - 1} more)` : ''}`);
      if (!ok.length) { setBusy(false); return; }
      setUploadedIds(ok.map((x) => x.id));
      setFiles([]);
      setPhase('tag');
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  }

  // ---- step 2: tag the new drafts ----
  async function applyTags() {
    const body = {};
    if (eventId) body.event_id = eventId;
    if (tagHorse) body.horse_id = tagHorse.id;
    if (tagRider) body.rider_id = tagRider.id;
    if (tagClass) body.class_id = tagClass;
    if (tagPrice !== '') body.price_cents = tagPrice;
    if (tagMoment) body.moment = tagMoment;
    if (Object.keys(body).length <= (eventId ? 1 : 0)) {
      setMsg('Pick a horse, rider, class, price or moment first (event is already set).');
      return;
    }
    setWorking(true); setMsg('');
    let ok = 0, fail = 0, firstErr = '';
    for (const id of uploadedIds) {
      try { await call(`/admin/media/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); ok += 1; }
      catch (e) { fail += 1; if (!firstErr) firstErr = e.message; }
    }
    setMsg(fail ? `Tagged ${ok}/${uploadedIds.length} (${fail} failed${firstErr ? `: ${firstErr}` : ''}).` : `Tagged ${ok}/${uploadedIds.length}.`);
    if (ok) setPhase('publish');
    setWorking(false);
  }

  // ---- step 3: publish ----
  async function publishAll() {
    if (!eventId) { setMsg('Pick an event first — publishing requires one.'); return; }
    setWorking(true); setMsg('');
    let ok = 0, fail = 0, firstErr = '';
    for (const id of uploadedIds) {
      try {
        // Event first (in case it was only just picked), then publish —
        // the server rejects publishing event-less rows.
        await call(`/admin/media/${id}`, { method: 'PATCH', body: JSON.stringify({ event_id: eventId }) });
        await call(`/admin/media/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
        ok += 1;
      } catch (e) { fail += 1; if (!firstErr) firstErr = e.message; }
    }
    if (fail) setMsg(`Published ${ok}/${uploadedIds.length} (${fail} failed${firstErr ? `: ${firstErr}` : ''}).`);
    else {
      setPublishMsg(`Published ${ok}/${uploadedIds.length} — live on the site now.`);
      setPhase('done');
    }
    setWorking(false);
  }

  function resetAll() {
    setPhase('upload');
    setUploadedIds([]);
    setTagHorse(null); setTagRider(null); setTagClass(''); setTagPrice(''); setTagMoment('');
    setPublishMsg(''); setMsg('');
  }

  const stepIdx = phase === 'upload' ? 0 : phase === 'tag' ? 1 : 2;
  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);
  const selectedEvent = events.find((e) => e.id === eventId);

  return (
    <>
      <h1 className={H1}>Upload photos</h1>
      <p className={SUB}>All three steps happen here — files land as drafts, then you tag and publish them.</p>

      {/* step indicator */}
      <ol className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px]" aria-label="Upload progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span aria-current={i === stepIdx ? 'step' : undefined}
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold ${i < stepIdx ? 'bg-goldbg text-gold border border-gold/60' : i === stepIdx ? 'bg-gold text-black' : 'border border-line text-faint'}`}>{i < stepIdx ? '✓' : i + 1}</span>
            <span className={i <= stepIdx ? 'text-white font-bold' : 'text-muted'}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 text-faint" aria-hidden="true">→</span>}
          </li>
        ))}
      </ol>

      {msg && <section className={CARD} role="alert"><p className="text-sm text-gold">{msg}</p></section>}

      {/* step 1 */}
      <section className={CARD}>
        <h2 className="text-[14px] font-bold mb-2.5">1 · Upload drafts</h2>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event (optional — can tag later)
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={INP} disabled={phase !== 'upload'}>
              <option value="">Unsorted (tag later)</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select></label>

          {phase === 'upload' && (
            <>
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
            </>
          )}
          {phase !== 'upload' && (
            <p className="text-[13px] text-muted">{uploadedIds.length} draft{uploadedIds.length > 1 ? 's' : ''} uploaded{selectedEvent ? <> to <b className="text-white">{selectedEvent.name}</b></> : ' (unsorted)'}. <button onClick={resetAll} className="text-sky hover:underline bg-none border-0 cursor-pointer text-[13px] p-0">Start over</button></p>
          )}
        </div>
      </section>

      {/* step 2 */}
      {phase !== 'upload' && (
        <section className={CARD}>
          <h2 className="text-[14px] font-bold mb-1">2 · Tag {uploadedIds.length} draft{uploadedIds.length > 1 ? 's' : ''}</h2>
          <p className="text-[13px] text-muted mb-3">Pick horse & rider by name (or a start-list candidate), then Apply to all {uploadedIds.length}.</p>
          <div className="grid gap-2.5 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Horse
              <EntityPicker kind="horse" value={tagHorse} onPick={setTagHorse} placeholder="Type horse name…" /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Rider
              <EntityPicker kind="rider" value={tagRider} onPick={setTagRider} placeholder="Type rider name…" /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Class
              <select value={tagClass} onChange={(e) => setTagClass(e.target.value)} className={INP} disabled={!eventId}>
                <option value="">{eventId ? 'No class' : 'Pick an event first'}</option>
                {classes.map((c) => <option key={c.class_id} value={c.class_id}>{c.name} ({c.rounds} rounds)</option>)}
              </select></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Price (cents)
              <input value={tagPrice} onChange={(e) => setTagPrice(e.target.value)} placeholder="e.g. 3500" inputMode="numeric" className={INP} /></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Moment
              <select value={tagMoment} onChange={(e) => setTagMoment(e.target.value)} className={INP}>
                <option value="">None</option>
                <option value="win">win</option>
                <option value="clear">clear</option>
                <option value="debut">debut</option>
                <option value="pb">pb</option>
              </select></label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={INP}>
                <option value="">Unsorted</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select></label>
          </div>
          {!!classes.length && (
            <details className="mt-3">
              <summary className="text-[13px] text-sky cursor-pointer hover:underline">Start-list candidates for this event ({classes.length} classes)</summary>
              <div className="space-y-2 mt-2 max-h-[240px] overflow-y-auto pr-1">
                {classes.slice(0, 12).map((c) => (
                  <div key={c.class_id} className="rounded border border-line bg-card2 p-2.5 text-[13px]">
                    <b>{c.name}</b>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {(c.candidates || []).slice(0, 8).map((p) => (
                        <button key={`${p.horse_id}-${p.rider_id}`}
                          onClick={() => { setTagHorse({ id: p.horse_id, name: p.horse }); setTagRider({ id: p.rider_id, name: p.rider }); setTagClass(c.class_id); }}
                          className={`rounded-full border px-2.5 py-1 text-[12px] cursor-pointer transition
                            ${tagHorse?.id === p.horse_id && tagRider?.id === p.rider_id
                              ? 'border-gold bg-goldbg text-gold font-bold' : 'border-line text-muted hover:text-white hover:border-gold/50'}`}>
                          {p.horse} × {p.rider}
                        </button>
                      ))}
                      {!(c.candidates || []).length && <span className="text-faint text-[12px]">No candidates yet — results not imported.</span>}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="mt-3">
            <button onClick={applyTags} disabled={working} className={BTN_PRIMARY}>
              {working ? 'Applying…' : `Apply tags to ${uploadedIds.length} draft${uploadedIds.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </section>
      )}

      {/* step 3 */}
      {(phase === 'publish' || phase === 'done') && (
        <section className={CARD}>
          <h2 className="text-[14px] font-bold mb-1">3 · Publish</h2>
          {phase === 'done' ? (
            <>
              <p className="text-[13px] text-gold mb-3">{publishMsg}</p>
              <div className="flex gap-3">
                <button onClick={() => router.push(`/admin/media${eventId ? `?event=${eventId}` : ''}`)} className={BTN_PRIMARY}>
                  View in library →
                </button>
                <button onClick={resetAll} className="text-sky text-sm self-center bg-none border-0 cursor-pointer hover:underline">Upload more</button>
              </div>
            </>
          ) : (
            <>
              {!eventId && (
                <p className="text-[13px] text-gold mb-2.5">Publishing needs an event — pick one above (step 2) or here:</p>
              )}
              <div className="flex flex-wrap items-end gap-2.5">
                {!eventId && (
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-faint">Event
                    <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={INP}>
                      <option value="">Unsorted</option>
                      {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                    </select></label>
                )}
                <button onClick={publishAll} disabled={working} className={BTN_PRIMARY}>
                  {working ? 'Publishing…' : `Publish ${uploadedIds.length} photo${uploadedIds.length > 1 ? 's' : ''}`}
                </button>
              </div>
              <p className="text-[12px] text-faint mt-2">Published photos go live on the site immediately.</p>
            </>
          )}
        </section>
      )}
    </>
  );
}
