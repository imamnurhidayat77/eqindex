'use client';
// Community moments review queue (ADMIN only): one intake (email) per card,
// its draft photos below. Bulk publish (tags optional) or reject with a
// reason that is emailed to the sender. Per-photo tweaks reuse TagModal.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import StudioShell, { Chip, Pager } from './studio';
import { useNotify } from './Toaster';
import { useConfirm } from './ConfirmModal';
import SearchSelect from './SearchSelect';
import TagModal from './TagModal';
import SmartImage from './SmartImage';
import { studio, useStudioUser, dayOf } from '../lib/studio';
import { searchSubjects } from '../lib/search-subjects';
import s from './MomentsClient.module.css';

const REASONS = [
  'Not appropriate for a family gallery',
  'Wrong event — not from this show',
  'Duplicate of an already published photo',
  'Too blurry or dark to publish',
  'Missing subject — no rider or horse identifiable',
];

// Server-matched bulk limits: photos ride the API (RAM-bound), video
// streams direct-to-R2 and never touches it.
const PHOTO_OK = ['image/jpeg', 'image/png', 'image/webp'];
const REEL_OK = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_PHOTO = 15 * 1024 * 1024;
const MAX_REEL = 200 * 1024 * 1024;
const MAX_FILES = 20;
const mb = (n) => `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;
const FILE_CHIP = { queued: '', uploading: 'white', processing: 'amber', done: 'green', failed: 'red', rejected: 'red' };

export default function MomentsClient() {
  const notify = useNotify();
  const { user, state } = useStudioUser();
  const [confirmUI, dialog] = useConfirm();
  const [intakes, setIntakes] = useState(null);
  const [events, setEvents] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [tagId, setTagId] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [upEvent, setUpEvent] = useState('');
  const [upFiles, setUpFiles] = useState([]); // {file, kind, status, progress, id, error, preview}
  const [working, setWorking] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const [bulkHorse, setBulkHorse] = useState('');
  const [bulkRider, setBulkRider] = useState('');
  const [tab, setTab] = useState('queue'); // queue | live | removed
  const [history, setHistory] = useState(null);
  const [pageByIntake, setPageByIntake] = useState({});

  const load = useCallback(() => {
    studio.get('/admin/moments').then((r) => { setIntakes(r || []); setSelected(new Set()); })
      .catch((e) => notify(e.message, true));
  }, [notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === 'queue') return;
    setHistory(null);
    studio.get(`/admin/media?source=email,admin&status=${tab === 'live' ? 'published' : 'archived'}&limit=200`)
      .then((r) => setHistory(r || [])).catch((e) => notify(e.message, true));
  }, [tab, notify]);
  useEffect(() => {
    studio.get('/events?limit=200').then((r) => setEvents(r || [])).catch(() => {});
    studio.get('/admin/license-tiers').then((r) => setTiers(r || [])).catch(() => {});
  }, []);

  if (state === 'loading' || intakes === null) return <p className="empty-note">Loading…</p>;
  if (state !== 'ok' || user?.role !== 'ADMIN') {
    return (
      <div className="event-media-empty">
        <p className="eyebrow">Restricted</p>
        <h3>Moments review is for admins.</h3>
        <p>Community uploads are moderated by our team before anything goes live.</p>
      </div>
    );
  }

  const allPhotos = (intakes || []).flatMap((t) => (t.photos || []).map((p) => ({ ...p, intake: t })));
  const selList = [...selected];
  const selUntagged = allPhotos.filter((p) => selected.has(p.id) && !p.horse_id && !p.rider_id).length;
  const tagging = allPhotos.find((p) => p.id === tagId) || null;

  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  // Bulk add: photos ride the API (multipart), video streams direct-to-R2
  // via presigned PUT and renders server-side — the API never buffers video.
  // Sequential, server-friendly; done files leave the list, failures stay.
  function addUpFiles(list) {
    const room = MAX_FILES - upFiles.length;
    const incoming = [...list].slice(0, Math.max(0, room)).map((file) => {
      const kind = PHOTO_OK.includes(file.type) ? 'photo' : REEL_OK.includes(file.type) ? 'reel' : 'bad';
      const tooBig = kind === 'photo' ? file.size > MAX_PHOTO : kind === 'reel' ? file.size > MAX_REEL : false;
      return {
        file, kind,
        status: kind === 'bad' || tooBig ? 'rejected' : 'queued',
        progress: 0, id: null,
        preview: kind === 'photo' ? URL.createObjectURL(file) : null,
        error: kind === 'bad' ? 'Use JPEG, PNG, WebP, MP4, MOV or WebM'
          : tooBig ? (kind === 'photo' ? 'Photos max 15MB' : 'Video max 200MB') : null,
      };
    });
    if ([...list].length > room) notify(`Batches hold ${MAX_FILES} files — extras left out`, true);
    setUpFiles((f) => [...f, ...incoming]);
    const bad = incoming.filter((x) => x.status === 'rejected');
    if (bad.length) notify(`${bad.length} skipped — check types and sizes below`, true);
  }

  function removeUpFile(i) {
    setUpFiles((fs) => {
      if (fs[i]?.preview) URL.revokeObjectURL(fs[i].preview);
      return fs.filter((_, j) => j !== i);
    });
  }

  async function uploadOnePhoto(item, setOne) {
    const form = new FormData();
    form.append('event_id', upEvent);
    form.append('files', item.file);
    const res = await fetch('/api/admin/moments/upload', { method: 'POST', credentials: 'include', body: form });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Upload failed (${res.status})`);
    const r = (j.data || [])[0];
    if (!r?.ok) throw new Error(r?.error || 'Upload failed');
    setOne({ status: 'done', progress: 100, id: r.id });
  }

  async function uploadOneVideo(item, setOne) {
    const init = await studio.post('/admin/moments/upload-url', {
      mimetype: item.file.type, size_bytes: item.file.size, filename: item.file.name, event_id: upEvent,
    });
    const { media_id, upload_url } = init;
    setOne({ progress: 30 });
    const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': item.file.type }, body: item.file });
    if (!put.ok) throw new Error('Transfer to storage failed — retry');
    setOne({ progress: 70, id: media_id });
    const fin = await studio.post(`/admin/media/${media_id}/finalize`, {});
    if (fin?.done) { setOne({ status: 'done', progress: 100 }); return; }
    let fails = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 15000));
      try {
        const m = await studio.get(`/admin/media/${media_id}`);
        if (m.thumb_key) { setOne({ status: 'done', progress: 100 }); return; }
        fails = 0;
        setOne({ progress: Math.min(95, 70 + i) });
      } catch (e) {
        if (++fails >= 3) throw new Error(e?.message || 'Render check failed');
      }
    }
    setOne({ status: 'processing', progress: 95 });
  }

  async function startUpload() {
    const queued = upFiles.map((f, i) => ({ ...f, i })).filter((f) => f.status === 'queued' || f.status === 'failed');
    if (!queued.length || working || !upEvent) return;
    setWorking(true);
    const setOne = (i, patch) => setUpFiles((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
    for (const q of queued) {
      setOne(q.i, { status: 'uploading', progress: 5, error: null });
      try {
        if (q.kind === 'photo') await uploadOnePhoto(q, (p) => setOne(q.i, p));
        else await uploadOneVideo(q, (p) => setOne(q.i, p));
      } catch (e) { setOne(q.i, { status: 'failed', error: e.message }); }
    }
    setWorking(false);
    setUpFiles((fs) => {
      const done = fs.filter((f) => f.status === 'done').length;
      const left = fs.filter((f) => f.status !== 'done');
      fs.filter((f) => f.status === 'done' && f.preview).forEach((f) => URL.revokeObjectURL(f.preview));
      if (done) notify(`${done} queued for review`);
      return left;
    });
    load();
  }

  // Unpublish is reversible but removes public content: confirm first, then
  // the photo returns to Queue as a draft (Removed is for rejections only).
  // Republish is one click — restoring needs no deliberation.
  async function flipStatus(id, to) {
    if (to !== 'published') {
      const ok = await dialog.confirm({
        title: 'Unpublish this moment?',
        message: 'It leaves the public pages now. It stays in Queue as a draft.',
        confirmLabel: 'Unpublish',
      });
      if (!ok) return;
    }
    try {
      await studio.patch(`/admin/media/${id}`, { status: to });
      setHistory((hs) => (hs || []).filter((h) => h.id !== id));
      if (to === 'published') {
        notify('Live ✓');
      } else {
        notify('Unpublished — back in Queue as a draft');
        setTab('queue');
        load();
      }
    } catch (e) { notify(e.message, true); }
  }

  async function removeOne(id) {
    const ok = await dialog.confirm({
      title: 'Delete this moment?',
      message: 'The files are removed permanently. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await studio.del(`/admin/media/${id}`);
      notify('Deleted');
      setHistory((hs) => (hs || []).filter((h) => h.id !== id));
    } catch (e) { notify(e.message, true); }
  }

  async function decide(action) {
    if (!selList.length || busy) return;
    if (action === 'publish' && selUntagged > 0) {
      const ok = await dialog.confirm({
        title: `Publish ${selUntagged} untagged?`,
        message: 'No rider or horse — no notifications will go out.',
        confirmLabel: 'Publish anyway',
      });
      if (!ok) return;
    }
    if (action === 'reject' && !reason.trim()) { notify('Pick a reason.', true); return; }
    setBusy(true);
    try {
      const body = { media_ids: selList, action };
      if (action === 'publish') {
        if (bulkHorse) body.horse_id = bulkHorse;
        if (bulkRider) body.rider_id = bulkRider;
      } else {
        body.reason = reason.trim();
      }
      const j = await studio.post('/admin/moments/decide', body);
      const n = (j?.published || j?.rejected || []).length;
      notify(action === 'publish' ? `${n} live ✓` : 'Rejected — sender notified');
      setSelected(new Set());
      setRejecting(false);
      load();
    } catch (e) { notify(e.message, true); } finally { setBusy(false); }
  }

  const queueCount = (intakes || []).reduce((n, t) => n + (t.photos || []).length, 0);
  return (
    <div className={s.scope}>
      {confirmUI}
      <div className="media-tabs-dark" role="group" aria-label="Moments sections" style={{ marginBottom: 12 }}>
        {[['queue', `Queue${queueCount ? ` (${queueCount})` : ''}`], ['live', 'Published'], ['removed', 'Removed']].map(([k, label]) => (
          <button key={k} type="button" aria-pressed={tab === k}
            className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'queue' ? (
      <>
      <details className={`auth-card ${s.uploadCard}`}>
        <summary style={{ cursor: 'pointer', fontSize: 13 }}>Add photos &amp; video</summary>
        <div className={s.uploadBody}>
          <label className={s.field}><span>Event</span>
            <SearchSelect value={upEvent} onChange={setUpEvent} placeholder="Pick the event…" panelClassName={s.panel}
              options={(events || []).map((e) => ({ id: e.id, label: e.name }))} />
          </label>
          <div className={`st-drop${drag ? ' over' : ''}`} style={{ display: 'grid', gap: 8, justifyItems: 'center' }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer?.files?.length) addUpFiles(e.dataTransfer.files); }}
            role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}>
            <strong>{drag ? 'Drop them' : 'Drop files here, or browse'}</strong>
            <small>Photos ≤15MB · Video ≤200MB · {MAX_FILES} per batch</small>
            <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              hidden onChange={(e) => { if (e.target.files?.length) addUpFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {!!upFiles.length && (
            <>
              <ul className="st-files">
                {upFiles.map((f, i) => (
                  <li key={`${f.file.name}-${i}`} className={`st-file st-file-${f.status}`}>
                    {f.preview
                      ? <span className="st-tagthumb"><SmartImage src={f.preview} alt={`Upload preview ${f.file.name}`} /></span>
                      : <span className="st-thumb st-thumb-reel">{f.kind === 'reel' ? '▶' : '×'}</span>}
                    <div className="st-file-meta">
                      <strong>{f.file.name}</strong>
                      <small>
                        <span className={`st-chip${f.kind === 'reel' ? ' white' : ''}`}>{f.kind === 'reel' ? '▶ Video' : 'Photo'}</span>
                        <span>{mb(f.file.size)}</span>
                        {f.status !== 'queued' && <span className={`st-chip ${FILE_CHIP[f.status] || ''}`}>{f.status}</span>}
                      </small>
                      {(f.status === 'uploading' || f.status === 'processing') && (
                        <span className="st-progress"><i style={{ width: `${f.progress}%` }} /></span>
                      )}
                      {f.error && (
                        <span className="st-file-err">{f.error}{' '}
                          <button type="button" onClick={() => setUpFiles((fs) => fs.map((x, j) => (j === i ? { ...x, status: 'queued', error: null } : x)))}>Retry</button>
                        </span>
                      )}
                    </div>
                    {!working && (
                      <button type="button" className="st-file-x" onClick={() => removeUpFile(i)} aria-label={`Remove ${f.file.name}`}>×</button>
                    )}
                  </li>
                ))}
              </ul>
              <div className={s.uploadFoot}>
                <button type="button" className="st-btn" disabled={working || !upEvent || !upFiles.some((f) => f.status === 'queued' || f.status === 'failed')} onClick={startUpload}>
                  {working ? 'Uploading…' : `Upload ${upFiles.filter((f) => f.status === 'queued' || f.status === 'failed').length || ''}`.trim()}
                </button>
                {!upEvent && !!upFiles.length && <small className="empty-note" style={{ margin: 0 }}>Pick the event first.</small>}
              </div>
            </>
          )}
        </div>
      </details>
      {selList.length > 0 && (
      <div className="st-filters" role="group" aria-label="Bulk moderation">
        <SearchSelect value={bulkHorse} onChange={setBulkHorse} options={[]} loadOptions={(v) => searchSubjects('horses', v)} placeholder="Horse…" panelClassName={s.panel} />
        <SearchSelect value={bulkRider} onChange={setBulkRider} options={[]} loadOptions={(v) => searchSubjects('riders', v)} placeholder="Rider…" panelClassName={s.panel} />
        <button type="button" className="st-btn-ghost" disabled={busy} onClick={() => decide('publish')}>
          Publish ({selList.length})
        </button>
        <button type="button" className="st-btn-ghost" disabled={busy} onClick={() => setRejecting((v) => !v)}>
          Reject
        </button>
      </div>
      )}
      {selUntagged > 0 && selList.length > 0 && (
        <p className="st-warn">{selUntagged} untagged — no notifications will go out.</p>
      )}
      {rejecting && !!selList.length && (
        <div className="auth-card" role="group" aria-label="Reject reason">
          <p className="eyebrow">Reject {selList.length} — reason sent to sender</p>
          <label className={s.field}><span>Reason</span>
            <select className={s.select} value={reason} onChange={(e) => setReason(e.target.value)}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <p className={s.rejectFoot}>
            <button type="button" className="st-btn-ghost" disabled={busy} onClick={() => decide('reject')}>Send rejection</button>
            <button type="button" className="st-btn-ghost" onClick={() => setRejecting(false)}>Cancel</button>
          </p>
        </div>
      )}
      {!intakes.length ? (
        <p className="empty-note">Queue clear.</p>
      ) : (
        <div style={{ display: 'grid', gap: 28 }}>
          {intakes.map((t) => (
            <section key={t.id} aria-label={`Upload from ${t.sender_email}`}>
                <div className={s.intakeHead}>
                  <strong style={{ fontSize: 14 }}>{t.sender_email}</strong>
                  <span className="st-chip">{t.origin === 'admin' ? 'Manual' : t.origin === 'web' ? 'Venue QR' : 'Email'}</span>
                  {!t.sender_verified && t.origin !== 'admin' && <span className="my-pill">Unverified</span>}
                <small style={{ color: '#888' }}>{t.event_name || t.event_code || 'No event'} · {dayOf(t.created_at)}</small>
                {(t.claimed_rider_name || t.claimed_horse_name) && (
                  <small style={{ color: '#aaa' }}>{[t.claimed_rider_name, t.claimed_horse_name].filter(Boolean).join(' × ')}</small>
                )}
                {t.status === 'awaiting_verify' && <small style={{ color: '#e3b341' }}>Awaiting verification</small>}
              </div>
              {!(t.photos || []).length ? (
                <p className="empty-note">No drafts left.</p>
              ) : (
                <>
                  <div className="st-media-grid">
                    {(t.photos || []).slice(pageByIntake[t.id] || 0, (pageByIntake[t.id] || 0) + QUEUE_LIMIT).map((p) => (
                      <MomentCard key={p.id} m={{ ...p, event_name: p.event_name || t.event_name }}
                        checked={selected.has(p.id)} onCheck={() => toggle(p.id)}
                        actionLabel="Tag & publish" onAction={() => setTagId(p.id)} />
                    ))}
                  </div>
                  <Pager total={(t.photos || []).length} limit={QUEUE_LIMIT} offset={pageByIntake[t.id] || 0}
                    onPage={(off) => setPageByIntake((m) => ({ ...m, [t.id]: off }))} />
                </>
              )}
            </section>
          ))}
        </div>
      )}
      </>
      ) : (
        <HistoryList rows={history} live={tab === 'live'}
          onFlip={(id) => flipStatus(id, tab === 'live' ? 'draft' : 'published')}
          onDelete={removeOne} />
      )}
      {tagging && (
        <TagModal m={tagging} events={events} tiers={tiers} notify={notify}
          publishedNote="Published as a community moment ✓"
          onClose={() => setTagId(null)}
          onSaved={() => { setTagId(null); load(); }} />
      )}
    </div>
  );
}

// Published / removed history: every decided moment in one place, with
// View (public page), Unpublish/Republish, and irreversible Delete.
// Same card language as the studio Library: overlay checkbox, status chip,
// name, meta, underlined action.
const HIST_LIMIT = 24;
const QUEUE_LIMIT = 12;

function HistoryList({ rows, live, onFlip, onDelete }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => { setOffset(0); }, [live, rows === null]);
  if (rows === null) return <p className="empty-note">Loading…</p>;
  if (!rows.length) {
    return <p className="empty-note">{live ? 'Nothing published yet.' : 'Nothing removed.'}</p>;
  }
  const safe = Math.min(offset, Math.max(0, (Math.ceil(rows.length / HIST_LIMIT) - 1) * HIST_LIMIT));
  const page = rows.slice(safe, safe + HIST_LIMIT);
  const linkBtn = {
    background: 'none', border: 0, borderBottom: '1px solid #555', padding: 0,
    paddingBottom: 3, cursor: 'pointer', color: '#bbb', fontSize: 12,
  };
  return (
    <>
      <div className="st-media-grid">
        {page.map((m) => (
          <article className="st-media-card" key={m.id}>
            {m.thumb_url || m.preview_url
              ? <SmartImage src={m.thumb_url || m.preview_url} alt={`${[m.horse, m.rider].filter(Boolean).join(' ridden by ') || 'Community moment'}${m.event_name ? ` at ${m.event_name}` : ''}`} width={800} height={600} sizes="(max-width: 768px) 50vw, 25vw" />
              : <span className="cover-fallback">No preview</span>}
            <footer>
              <span><Chip status={m.status} /> {m.kind === 'reel' && <Chip status="reel" />}</span>
              <strong>{[m.horse, m.rider].filter(Boolean).join(' · ') || 'Untagged'}</strong>
              <span>{m.event_name || 'No event'}</span>
              <span style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                <Link href={`/moments/${m.id}`} style={{ borderBottom: '1px solid #555', paddingBottom: 3, color: '#bbb', fontSize: 12 }}>View</Link>
                <button type="button" style={linkBtn} onClick={() => onFlip(m.id)}>
                  {live ? 'Unpublish' : 'Republish'}
                </button>
                <button type="button" style={linkBtn} onClick={() => onDelete(m.id)}>Delete</button>
              </span>
            </footer>
          </article>
        ))}
      </div>
      <Pager total={rows.length} limit={HIST_LIMIT} offset={safe} onPage={setOffset} />
    </>
  );
}

// Queue + history share one card: overlay checkbox, status chip, name,
// meta line, one underlined primary action — the Library ItemCard dialect.
function MomentCard({ m, checked, onCheck, actionLabel, onAction }) {
  return (
    <article className="st-media-card">
      <input type="checkbox" className="sel" checked={checked} onChange={onCheck}
        aria-label={`Select ${[m.horse, m.rider].filter(Boolean).join(' · ') || m.id.slice(0, 8)}`} />
      {m.thumb_url || m.preview_url
        ? <SmartImage src={m.thumb_url || m.preview_url} alt={`${[m.horse, m.rider].filter(Boolean).join(' ridden by ') || 'Community moment'}${m.event_name ? ` at ${m.event_name}` : ''}`} width={800} height={600} sizes="(max-width: 768px) 50vw, 25vw" />
        : <span className="cover-fallback">{m.kind === 'reel' ? 'Rendering video…' : 'No preview'}</span>}
      <footer>
        <span><Chip status={m.status || 'draft'} /> {m.kind === 'reel' && <Chip status="reel" />}</span>
        <strong>{[m.horse, m.rider].filter(Boolean).join(' · ') || 'Untagged'}</strong>
        <span>{m.event_name || 'No event'}</span>
        <button className="st-link" style={{ background: 'none', border: 0, borderBottom: '1px solid #555', padding: 0, paddingBottom: 3, cursor: 'pointer', justifySelf: 'start', marginTop: 4, color: '#bbb', fontSize: 12 }} onClick={onAction}>
          {actionLabel}
        </button>
      </footer>
    </article>
  );
}

export function MomentsPage() {
  return (
    <StudioShell active="moments">
      <MomentsClient />
    </StudioShell>
  );
}
