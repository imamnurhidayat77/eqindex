'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import StudioShell from './studio';
import { useNotify } from './Toaster';
import TagModal from './TagModal';
import SearchSelect from './SearchSelect';
import { searchSubjects } from '../lib/search-subjects';
import { Icon } from './figma';
import SmartImage from './SmartImage';
import { API } from '../lib/api';
import { studio } from '../lib/studio';

const PHOTO_OK = ['image/jpeg', 'image/png', 'image/webp'];
const REEL_OK = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_PHOTO = 15 * 1024 * 1024;
const MAX_REEL = 200 * 1024 * 1024;
const MAX_FILES = 20;

const mb = (n) => `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;

// Single searchable event picker: one control that shows the current
// choice and filters as you type (replaces the old filter-box + select pair).
function EventPicker({ events, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open ]);

  const needle = q.trim().toLowerCase();
  const opts = needle
    ? events.filter((e) => `${e.name} ${e.venue || ''}`.toLowerCase().includes(needle))
    : events;
  const current = events.find((e) => e.id === value);

  return (
    <div className="st-combo" ref={box}>
      <button type="button" className="st-combo-btn" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setQ(''); }}>
        <span className="st-combo-val">{current ? current.name : 'No event — upload as untagged drafts'}</span>
        <Icon name="chevron" size={15} />
      </button>
      {open && (
        <div className="st-combo-pop" role="listbox" aria-label="Pick an event">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events…" aria-label="Search events" />
          <ul>
            <li>
              <button type="button" onClick={() => { onChange(''); setOpen(false); }}>
                <strong>No event — untagged drafts</strong>
                <small>Tag and attach later from the Library</small>
              </button>
            </li>
            {opts.slice(0, 80).map((e) => (
              <li key={e.id}>
                <button type="button" aria-selected={e.id === value} onClick={() => { onChange(e.id); setOpen(false); }}>
                  <strong>{e.name}</strong>
                  {(e.date_start || e.venue) && (
                    <small>{e.date_start ? String(e.date_start).slice(0, 10) : ''}{e.date_start && e.venue ? ' · ' : ''}{e.venue || ''}</small>
                  )}
                </button>
              </li>
            ))}
            {!opts.length && <li className="st-combo-empty">No events match “{q}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function UploadClient({ events }) {
  const notify = useNotify();
  const [eventId, setEventId] = useState('');
  const [files, setFiles] = useState([]); // {file, kind, status, progress, id, error, preview}
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [tagged, setTagged] = useState([]); // full media rows for uploaded files
  const [tiers, setTiers] = useState([]);
  const [tagId, setTagId] = useState(null);
  const [sel, setSel] = useState([]); // bulk-tag selection (media ids)
  const inputRef = useRef(null);

  useEffect(() => { studio.get('/admin/license-tiers').then((r) => setTiers(r || [])).catch(() => {}); }, []);

  useEffect(() => () => {
    setFiles((fs) => { fs.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)); return fs; });
  }, []);

  const evName = events.find((e) => e.id === eventId)?.name || '';

  function revoke(list) { list.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)); }

  function addFiles(list) {
    const room = MAX_FILES - files.length;
    const incoming = [...list].slice(0, Math.max(0, room)).map((file) => {
      const kind = PHOTO_OK.includes(file.type) ? 'photo' : REEL_OK.includes(file.type) ? 'reel' : 'bad';
      const tooBig = kind === 'photo' ? file.size > MAX_PHOTO : kind === 'reel' ? file.size > MAX_REEL : false;
      return {
        file, kind,
        status: kind === 'bad' || tooBig ? 'rejected' : 'queued',
        progress: 0, id: null,
        preview: kind === 'photo' ? URL.createObjectURL(file) : null,
        error: kind === 'bad' ? `Unsupported type — use JPEG, PNG, WebP, MP4, MOV or WebM`
          : tooBig ? `Too big — ${kind === 'photo' ? 'photos max 15MB' : 'reels max 200MB'}` : null,
      };
    });
    if ([...list].length > room) notify(`Batches hold ${MAX_FILES} files — extras left out`, true);
    setFiles((f) => [...f, ...incoming]);
    const bad = incoming.filter((x) => x.status === 'rejected');
    if (bad.length) notify(`${bad.length} file${bad.length === 1 ? '' : 's'} skipped — check types and sizes below`, true);
  }

  function removeAt(i) {
    setFiles((fs) => {
      const target = fs[i];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      if (target?.id) {
        setTagged((ts) => ts.filter((t) => t.id !== target.id));
        setSel((ss) => ss.filter((id) => id !== target.id));
      }
      return fs.filter((_, j) => j !== i);
    });
  }

  function clearAll() {
    setFiles((fs) => { revoke(fs); return []; });
    setTagged([]);
    setTagId(null);
    setSel([]);
  }

  async function uploadPhoto(item, setOne) {
    const form = new FormData();
    form.append('files', item.file);
    if (eventId) form.append('event_id', eventId);
    const res = await fetch('/api/admin/media/upload', { method: 'POST', credentials: 'include', body: form });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Upload failed (${res.status})`);
    const r = (j.data || [])[0];
    if (!r?.ok) throw new Error(r?.error || 'Upload failed');
    setOne({ status: 'done', progress: 100, id: r.id });
    return r.id;
  }

  async function uploadReel(item, setOne) {
    if (item.file.size > MAX_REEL) throw new Error('Reel over 200MB');
    const init = await studio.post('/admin/media/upload-url', {
      mimetype: item.file.type, size_bytes: item.file.size, filename: item.file.name, ...(eventId ? { event_id: eventId } : {}),
    });
    const { media_id, upload_url } = init.data || init;
    setOne({ progress: 30 });
    const put = await fetch(upload_url, { method: 'PUT', headers: { 'Content-Type': item.file.type }, body: item.file });
    if (!put.ok) throw new Error('Transfer to storage failed — retry');
    setOne({ progress: 70, id: media_id });
    const fin = await studio.post(`/admin/media/${media_id}/finalize`, {});
    if (fin.data?.done) { setOne({ status: 'done', progress: 100 }); return media_id; }
    // Poll until the poster + teaser exist (transcode takes minutes).
    // Capped ~5 min: 3 straight failures abort loudly instead of hanging.
    let fails = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 15000));
      try {
        const m = await studio.get(`/admin/media/${media_id}`);
        if (m.thumb_key) { setOne({ status: 'done', progress: 100 }); return media_id; }
        fails = 0;
        setOne({ progress: Math.min(95, 70 + i) });
      } catch (e) {
        if (++fails >= 3) throw new Error(e?.message || 'Render check failed — retry from the Library');
      }
    }
    setOne({ status: 'processing', progress: 95 });
    return media_id;
  }

  async function start() {
    const queued = files.map((f, i) => ({ ...f, i })).filter((f) => f.status === 'queued' || f.status === 'failed');
    if (!queued.length || busy) return;
    setBusy(true);
    const setOne = (i, patch) => setFiles((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
    const newIds = [];
    for (const q of queued) {
      setOne(q.i, { status: 'uploading', progress: 5, error: null });
      try {
        const id = q.kind === 'photo'
          ? await uploadPhoto(q, (p) => setOne(q.i, p))
          : await uploadReel(q, (p) => setOne(q.i, p));
        if (id) { setOne(q.i, { id }); newIds.push(id); }
      } catch (e) { setOne(q.i, { status: 'failed', error: e.message }); }
    }
    setBusy(false);
    // Pull full rows for what just uploaded so tagging happens right here.
    const fresh = [];
    for (const id of [...new Set(newIds)]) {
      try {
        const row = await studio.get(`/admin/media/${id}`);
        if (row) fresh.push(row);
      } catch {}
    }
    if (fresh.length) setTagged((ts) => {
      const seen = new Set(ts.map((t) => t.id));
      return [...ts, ...fresh.filter((r) => !seen.has(r.id))];
    });
    notify(fresh.length ? 'Batch finished — tag and publish below' : 'Batch finished — review failures below');
  }

  async function publishIds(ids) {
    if (!ids.length || publishing) return;
    setPublishing(true);
    let ok = 0; const fails = [];
    for (const id of ids) {
      try {
        const u = await studio.patch(`/admin/media/${id}`, { status: 'published' });
        setTagged((ts) => ts.map((t) => (t.id === id ? { ...t, ...(u.data || u), status: 'published' } : t)));
        ok++;
      } catch (e) { fails.push(e.message); }
    }
    setPublishing(false);
    notify(fails.length ? `${ok} published, ${fails.length} failed — ${fails[0]}` : `${ok} live in the shop ✓`, fails.length > 0);
  }

  const valid = files.filter((f) => f.status !== 'rejected');
  const queued = files.filter((f) => f.status === 'queued' || f.status === 'failed');
  const failed = files.filter((f) => f.status === 'failed');
  const active = files.filter((f) => f.status === 'uploading' || f.status === 'processing');
  const photos = valid.filter((f) => f.kind === 'photo').length;
  const reels = valid.filter((f) => f.kind === 'reel').length;
  const totalMB = valid.reduce((s, f) => s + f.file.size, 0);
  const overall = valid.length ? Math.round(valid.reduce((s, f) => s + (f.progress || 0), 0) / valid.length) : 0;

  const STATUS_CHIP = { queued: '', uploading: 'white', processing: 'amber', done: 'green', failed: 'red', rejected: 'red' };
  const STATUS_LABEL = { queued: 'Ready', uploading: 'Uploading', processing: 'Rendering', done: 'Uploaded', failed: 'Failed', rejected: 'Skipped' };

  const publishable = tagged.filter((m) => m.event_id && m.status !== 'published');
  const openDrafts = tagged.filter((m) => m.status !== 'published');
  const nextUp = tagged.find((m) => m.status !== 'published');
  const allLive = tagged.length > 0 && tagged.every((m) => m.status === 'published');
  const tagging = tagged.find((t) => t.id === tagId) || null;

  return (
    <StudioShell active="upload">
      <div className="st-upload-grid">
        <div>
          <section className="st-step">
            <header>
              <span className="st-step-n">01</span>
              <div>
                <h3>Pick an event</h3>
                <p>One event per batch — everything uploads tagged and ready to publish. Or skip and tag later.</p>
              </div>
            </header>
            <EventPicker events={events} value={eventId} onChange={setEventId} />
            {!eventId && (
              <p className="st-warn">Heads up — without an event these land as drafts and can&apos;t publish until tagged. <Link href="/studio/library?untagged=1">Tag them later in the Library →</Link></p>
            )}
          </section>

          <section className="st-step">
            <header>
              <span className="st-step-n">02</span>
              <div>
                <h3>Add photos &amp; reels</h3>
                <p>JPEG, PNG or WebP ≤ 15 MB · MP4, MOV or WebM ≤ 200 MB · {MAX_FILES} per batch. General library uploads — fulfilling a paid reel order? <Link href="/studio/reels">Link the finished file from Pre-book orders instead →</Link></p>
              </div>
            </header>
            <div className={`st-drop${drag ? ' over' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); }}
              role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}>
              <strong>{drag ? 'Drop them — we\'ve got you' : 'Drag files here, or click to browse'}</strong>
              <small>Photos go straight up · reels stream direct-to-storage, then render</small>
              <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                hidden onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            {!!files.length && (
              <ul className="st-files">
                {files.map((f, i) => (
                  <li key={`${f.file.name}-${i}`} className={`st-file st-file-${f.status}`}>
                    {f.preview
                      ? <SmartImage src={f.preview} alt={`Upload preview ${f.file.name}`} width={128} height={96} className="st-thumb" />
                      : <span className="st-thumb st-thumb-reel">{f.kind === 'reel' ? '▶' : '×'}</span>}
                    <div className="st-file-meta">
                      <strong>{f.file.name}</strong>
                      <small>
                        <span className={`st-chip${f.kind === 'reel' ? ' white' : ''}`}>{f.kind === 'reel' ? '▶ Reel' : 'Photo'}</span>
                        <span>{mb(f.file.size)}</span>
                        <span className={`st-chip ${STATUS_CHIP[f.status] || ''}`}>{STATUS_LABEL[f.status] || f.status}</span>
                      </small>
                      {(f.status === 'uploading' || f.status === 'processing') && (
                        <span className="st-progress"><i style={{ width: `${f.progress}%` }} /></span>
                      )}
                      {f.error && (
                        <span className="st-file-err">{f.error}{' '}
                          <button type="button" onClick={() => setFiles((fs) => fs.map((x, j) => (j === i ? { ...x, status: 'queued', error: null } : x)))}>Retry</button>
                        </span>
                      )}
                    </div>
                    {!busy && (
                      <button type="button" className="st-file-x" onClick={() => removeAt(i)} aria-label={`Remove ${f.file.name}`}>×</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!!tagged.length && (
            <section className="st-step" aria-label="Tag and publish">
              <header>
                <span className="st-step-n">04</span>
                <div>
                  <h3>Tag &amp; publish — right here</h3>
                  <p>Horse, rider, moment and tier per file — or tick several and tag them together. Live the second you hit publish.</p>
                </div>
              </header>
              <BulkBar tiers={tiers} eventId={eventId} ids={sel.filter((id) => tagged.some((t) => t.id === id && t.status !== 'published'))}
                notify={notify}
                onEach={(id, row) => setTagged((ts) => ts.map((t) => (t.id === id ? { ...t, ...row } : t)))}
                onFinished={() => setSel([])} />
              {tagged.some((m) => m.status !== 'published') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#aaa', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: '#fff', width: 16, height: 16, cursor: 'pointer' }}
                      checked={tagged.filter((m) => m.status !== 'published').every((m) => sel.includes(m.id))}
                      onChange={(e) => setSel(e.target.checked ? tagged.filter((m) => m.status !== 'published').map((m) => m.id) : [])} />
                    Select all drafts
                  </label>
                  {!!sel.length && <span style={{ fontSize: 12, color: '#777' }}>{sel.length} selected</span>}
                </div>
              )}
              <ul className="st-taglist">
                {tagged.map((m) => (
                  <li key={m.id} className="st-tagrow">
                    {m.status !== 'published' && (
                      <input type="checkbox" checked={sel.includes(m.id)} aria-label={`Select ${[m.horse, m.rider].filter(Boolean).join(' · ') || m.id.slice(0, 8)} for bulk tagging`}
                        onChange={(e) => setSel((ss) => (e.target.checked ? [...ss, m.id] : ss.filter((id) => id !== m.id)))}
                        style={{ accentColor: '#fff', width: 18, height: 18, flex: 'none', cursor: 'pointer' }} />
                    )}
                    {m.thumb_url || m.preview_url
                      ? <span className="st-tagthumb">{m.kind === 'reel' && <i aria-hidden="true">▶</i>}<SmartImage src={m.thumb_url || m.preview_url} alt={[m.horse, m.rider].filter(Boolean).join(' · ') || `File ${m.id.slice(0, 8)}`} fill sizes="64px" /></span>
                      : <span className="st-tagthumb-fallback">{m.kind === 'reel' ? '▶' : '…'}</span>}
                    <div className="st-tagmeta">
                      <strong>{[m.horse, m.rider].filter(Boolean).join(' · ') || `File ${m.id.slice(0, 8)}`}</strong>
                      <small>
                        <span className={`st-chip${m.kind === 'reel' ? ' white' : ''}`}>{m.kind === 'reel' ? '▶ Reel' : 'Photo'}</span>
                        {m.status === 'published' ? 'Live in the shop' : 'Draft'}
                        {!(m.horse_id || m.rider_id) && m.status !== 'published' ? ' · Untagged' : ''}
                        {!m.event_id ? ' · No event' : ''}
                      </small>
                    </div>
                    <button type="button" className="st-btn-ghost" onClick={() => setTagId(m.id)}>Tag</button>
                    {m.status !== 'published' && (
                      <button type="button" className="st-btn-ghost" disabled={publishing || !m.event_id}
                        title={m.event_id ? 'Make it live in the shop' : 'Pick an event in the Tag dialog first'}
                        onClick={() => publishIds([m.id])}>Publish</button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="st-tagger-foot">
                <button type="button" className="st-btn" disabled={publishing || !publishable.length} onClick={() => publishIds(publishable.map((m) => m.id))}>
                  {publishing ? 'Publishing…' : publishable.length ? `Publish all (${publishable.length})` : 'Nothing ready to publish'}
                </button>
                <span className="st-ksub">Needs an event per file — set it in the Tag dialog.</span>
              </div>
            </section>
          )}
        </div>

        <aside className="st-card st-summary" aria-label="Review and upload">
          <p className="st-klabel">03 · Review &amp; upload</p>
          <strong className="st-kval">{valid.length ? `${valid.length} file${valid.length === 1 ? '' : 's'}` : 'Empty batch'}</strong>
          <small className="st-ksub">
            {evName || 'No event selected'}
            {(photos || reels) ? ` · ${photos} photo${photos === 1 ? '' : 's'} · ${reels} reel${reels === 1 ? '' : 's'}` : ''}
            {valid.length ? ` · ${mb(totalMB)}` : ''}
          </small>
          {(busy || overall > 0) && (
            <span className="st-progress st-overall"><i style={{ width: `${overall}%` }} /></span>
          )}
          {active.length > 0 && <small className="st-ksub">Working… reels keep rendering after upload — safe to leave.</small>}
          <div className="st-summary-actions">
            {busy ? (
              <button className="st-btn" disabled>Uploading…</button>
            ) : queued.length ? (
              <button className="st-btn" onClick={start}>
                Upload {queued.length} file{queued.length === 1 ? '' : 's'}
              </button>
            ) : nextUp ? (
              <button className="st-btn" onClick={() => setTagId(nextUp.id)}>
                Tag &amp; publish ↓
              </button>
            ) : allLive ? (
              <button className="st-btn" disabled>All live ✓</button>
            ) : (
              <button className="st-btn" disabled>Add files first</button>
            )}
            {!!files.length && <button className="st-btn-ghost" disabled={busy} onClick={clearAll}>Clear all</button>}
          </div>
          {failed.length > 0 && !busy && <small className="st-ksub st-ksub-err">{failed.length} failed — fix and re-upload just those.</small>}
          {openDrafts.length > 0 && !busy && (
            <small className="st-ksub">{openDrafts.length} draft{openDrafts.length === 1 ? '' : 's'} waiting below — tag, then publish.</small>
          )}
          {allLive && (
            <Link href="/studio/library?status=published" className="st-link">See them in the Library →</Link>
          )}
        </aside>
      </div>
      {tagging && (
        <TagModal key={tagging.id} m={tagging} events={events} tiers={tiers} notify={notify}
          onClose={() => setTagId(null)}
          onSaved={(u) => setTagged((ts) => ts.map((x) => (x.id === tagging.id ? { ...x, ...u } : x)))}
          onDeleted={() => {
            setTagged((ts) => ts.filter((x) => x.id !== tagging.id));
            setFiles((fs) => fs.filter((f) => f.id !== tagging.id));
            setTagId(null);
          }} />
      )}
    </StudioShell>
  );
}

// Bulk tag bar: applies the filled fields to every selected draft.
// Empty fields are skipped (never cleared in bulk). Class needs the batch
// event — without it the field stays hidden since lists are per-event.
function BulkBar({ tiers, eventId, ids, notify, onEach, onFinished }) {
  const [riderId, setRiderId] = useState('');
  const [rider, setRider] = useState('');
  const [horseId, setHorseId] = useState('');
  const [horse, setHorse] = useState('');
  const [classId, setClassId] = useState('');
  const [cls, setCls] = useState('');
  const [classes, setClasses] = useState([]);
  const [moment, setMoment] = useState('');
  const [tier, setTier] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) { setClasses([]); return; }
    fetch(`${API}/api/event-classes?event_id=${encodeURIComponent(eventId)}`, { credentials: 'include' })
      .then((r) => r.json()).then((j) => setClasses(j.data || [])).catch(() => setClasses([]));
  }, [eventId]);

  const searchPeople = (kind) => (v) => searchSubjects(kind, v);

  if (!ids.length) return null;
  const apply = async () => {
    const body = {};
    if (riderId) body.rider_id = riderId;
    if (horseId) body.horse_id = horseId;
    if (classId) body.class_id = classId;
    if (moment) body.moment = moment;
    if (tier) body.license_default = tier;
    if (!Object.keys(body).length) { notify('Fill at least one field to apply.', true); return; }
    setBusy(true);
    let ok = 0;
    let firstErr = '';
    for (const id of ids) {
      try {
        const u = await studio.patch(`/admin/media/${id}`, body);
        onEach(id, u.data || u);
        ok++;
      } catch (e) { if (!firstErr) firstErr = e.message; }
    }
    setBusy(false);
    const failed = ids.length - ok;
    notify(failed ? `${ok} tagged, ${failed} failed — ${firstErr}` : `Tags applied to ${ok} photo${ok === 1 ? '' : 's'}`, failed > 0);
    if (!failed) onFinished();
  };

  const fld = { minWidth: 180, flex: '1 1 180px', display: 'grid', gap: 6 };
  return (
    <div className="st-card" style={{ padding: 16, marginBottom: 12 }}>
      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700 }}>
        Tag {ids.length} selected <span style={{ color: '#777', fontWeight: 400 }}>— filled fields apply to all, empty ones are skipped</span>
      </p>
      <div className="st-filters" style={{ margin: 0 }}>
        <label style={fld}><span style={lbl}>Rider</span>
          <SearchSelect options={[]} loadOptions={searchPeople('riders')} value={riderId || null}
            selectedOption={riderId ? { id: riderId, label: rider } : null}
            onChange={(id, o) => { setRiderId(id || ''); setRider(o?.label || ''); }}
            placeholder="Same rider…" emptyHint="Type at least 2 letters" />
        </label>
        <label style={fld}><span style={lbl}>Horse</span>
          <SearchSelect options={[]} loadOptions={searchPeople('horses')} value={horseId || null}
            selectedOption={horseId ? { id: horseId, label: horse } : null}
            onChange={(id, o) => { setHorseId(id || ''); setHorse(o?.label || ''); }}
            placeholder="Same horse…" emptyHint="Type at least 2 letters" />
        </label>
        {!!eventId && (
          <label style={fld}><span style={lbl}>Class</span>
            <SearchSelect options={classes.map((c) => ({ id: c.id, label: c.name }))}
              value={classId || null}
              selectedOption={classId ? { id: classId, label: cls } : null}
              onChange={(id, o) => { setClassId(id || ''); setCls(o?.label || ''); }}
              placeholder="Same class…" emptyHint="No classes for this event" />
          </label>
        )}
        <label style={fld}><span style={lbl}>Moment</span>
          <SearchSelect options={['win', 'clear', 'debut', 'pb'].map((v) => ({ id: v, label: v[0].toUpperCase() + v.slice(1) }))}
            value={moment || null} onChange={(id) => setMoment(id || '')} placeholder="Same moment…" />
        </label>
        <label style={fld}><span style={lbl}>Tier</span>
          <SearchSelect options={(tiers || []).map((t) => ({ id: t.id, label: t.label }))}
            value={tier || null} onChange={(id) => setTier(id || '')} placeholder="Same tier…" />
        </label>
        <button className="st-btn" disabled={busy} onClick={apply} style={{ alignSelf: 'end' }}>
          {busy ? 'Applying…' : `Apply to ${ids.length}`}
        </button>
      </div>
    </div>
  );
}

const lbl = { color: '#777', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' };
