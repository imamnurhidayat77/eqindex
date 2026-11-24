'use client';
// Venue QR upload: email + mobile, phone-gallery/camera pickers for photos
// and one video, optional rider/horse, consent gate. Photos post multipart;
// video goes direct-to-R2 (presigned PUT) then finalize — same split as the
// studio reel flow, so big files never ride the API proxy.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { API } from '../lib/api';
import ReelPlayer from './ReelPlayer';
import SmartImage from './SmartImage';
import styles from './UploadQr.module.css';

// Thumbnail with its own object URL so removal/unmount never leaks memory.
function PhotoThumb({ file, onRemove }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className={styles.thumb}>
      {/* blob: SmartImage meneruskannya sebagai tag img mentah (jalur resmi untuk pratinjau lokal) */}
      {src && <SmartImage src={src} alt={file.name} fill sizes="160px" />}
      <button type="button" className={styles.removeBtn} onClick={onRemove} aria-label={`Remove ${file.name}`}>×</button>
      <span className={styles.thumbSize}>{(file.size / 1048576).toFixed(1)}MB</span>
    </div>
  );
}

function VideoPreview({ file, onRemove }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className={styles.videoWrap}>
      {src && <ReelPlayer src={src} label={file.name} />}
      <button type="button" className={styles.removeBtn} onClick={onRemove} aria-label={`Remove ${file.name}`}>×</button>
      <span className={styles.thumbSize}>{file.name} · {(file.size / 1048576).toFixed(0)}MB</span>
    </div>
  );
}

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const fmtDay = (iso) => {
  const d = iso ? new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
};

export default function UploadQrClient({ code }) {
  const cleanCode = String(code || '').trim().toUpperCase();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', phone: '', rider: '', horse: '', consent: false });
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(''); // uploading… / processing video…
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const photoRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/upload/event?code=${encodeURIComponent(cleanCode)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })).catch(() => ({ ok: false, j: {} })))
      .then(({ ok, j }) => {
        if (!ok) setEvent(false);
        else setEvent(j.data);
        setLoading(false);
      })
      .catch(() => { setEvent(false); setLoading(false); });
  }, [cleanCode]);

  function pickPhotos(e) {
    const fresh = [...(e.target.files || [])].filter((f) => f.type.startsWith('image/'));
    if (fresh.length) setPhotos((prev) => [...prev, ...fresh].slice(0, MAX_PHOTOS));
    e.target.value = '';
  }

  function pickVideo(e) {
    setVideo((e.target.files || [])[0] || null);
    e.target.value = '';
  }

  const tooBigPhoto = photos.find((f) => f.size > MAX_PHOTO_BYTES);
  const badVideo = video && (video.size > MAX_VIDEO_BYTES || video.size <= 0);
  const canSubmit = !busy && !tooBigPhoto && !badVideo
    && form.email.trim() && form.consent && (photos.length > 0 || video);

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr('');
    try {
      const contact = {
        event_code: cleanCode,
        email: form.email.trim(),
        phone: form.phone.trim(),
        rider_name: form.rider.trim(),
        horse_name: form.horse.trim(),
        consent: true,
      };
      let accepted = 0;
      let rejected = [];
      let awaitingVerify = false;
      if (photos.length) {
        setPhase(`Uploading ${photos.length} photo${photos.length > 1 ? 's' : ''}…`);
        const fd = new FormData();
        for (const [k, v] of Object.entries(contact)) fd.append(k, v);
        for (const f of photos) fd.append('files', f, f.name);
        const res = await fetch(`${API}/api/upload/web`, { method: 'POST', body: fd });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Photo upload failed — try again.');
        accepted += j.data.accepted || 0;
        rejected = rejected.concat(j.data.rejected || []);
        awaitingVerify = awaitingVerify || !!j.data.awaiting_verify;
      }
      if (video) {
        setPhase('Preparing video upload…');
        const init = await fetch(`${API}/api/upload/web-url`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...contact, mimetype: video.type, size_bytes: video.size, filename: video.name }),
        });
        const ij = await init.json().catch(() => ({}));
        if (!init.ok) throw new Error(ij.error || 'Video upload failed — try again.');
        setPhase('Sending video… (keep this page open)');
        const put = await fetch(ij.data.upload_url, {
          method: 'PUT', body: video, headers: { 'Content-Type': video.type },
        });
        if (!put.ok) throw new Error('Video did not arrive — check your connection and retry.');
        setPhase('Processing video…');
        const fin = await fetch(`${API}/api/upload/web-finalize`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ media_id: ij.data.media_id }),
        });
        const fj = await fin.json().catch(() => ({}));
        if (!fin.ok) throw new Error(fj.error || 'Video processing failed — try again.');
        accepted += 1;
        awaitingVerify = awaitingVerify || !!fj.data.awaiting_verify;
      }
      setDone({ accepted, rejected, awaitingVerify });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Boss Media · Community upload</p>
        {loading ? (
          <p className={styles.lede}>Finding your event…</p>
        ) : !event ? (
          <>
            <h1>That code didn’t work.</h1>
            <p className={styles.lede}>
              “{cleanCode || '—'}” isn’t taking uploads right now. Check the poster
              and try the code printed under the QR.
            </p>
            <p><Link href="/upload" className={styles.primaryLink}>Try another code</Link></p>
          </>
        ) : done ? (
          <>
            <h1>{done.awaitingVerify ? 'One last tap.' : 'Sent for review.'}</h1>
            <p className={styles.lede}>
              {done.awaitingVerify
                ? `We emailed ${form.email.trim()} — tap the link in that email so we know it’s really you. Then our team reviews your ${done.accepted || ''} file${done.accepted === 1 ? '' : 's'}.`
                : `Thanks — ${done.accepted} file${done.accepted === 1 ? ' is' : 's are'} queued for a quick check. Nothing goes live until our team approves it.`}
            </p>
            {!!done.rejected?.length && (
              <ul className={styles.rejected}>
                {done.rejected.map((r, i) => <li key={i}>{r.file}: {r.reason}</li>)}
              </ul>
            )}
            <p className={styles.fine}><Link href="/events">Browse galleries</Link></p>
          </>
        ) : (
          <>
            <h1>{event.name}</h1>
            <p className={styles.meta}>
              {[event.venue, event.region].filter(Boolean).join(' · ')}
              {event.date_start && ` · ${fmtDay(event.date_start)}${event.date_end && event.date_end !== event.date_start ? ` – ${fmtDay(event.date_end)}` : ''}`}
            </p>
            <form onSubmit={submit} className={styles.stack}>
              <div className={styles.pickRow}>
                <button type="button" className={styles.pick} onClick={() => photoRef.current?.click()}>
                  <strong>{photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} added` : 'Add photos'}</strong>
                  <small>Camera or gallery · up to {MAX_PHOTOS}</small>
                </button>
                <button type="button" className={styles.pick} onClick={() => videoRef.current?.click()}>
                  <strong>{video ? '1 video added' : 'Add a video'}</strong>
                  <small>Record or gallery · ≤200MB</small>
                </button>
              </div>
              <input ref={photoRef} type="file" accept="image/*" multiple className={styles.hidden} onChange={pickPhotos} aria-label="Add photos" />
              <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,video/webm" className={styles.hidden} onChange={pickVideo} aria-label="Add a video" />
              {!!photos.length && (
                <div className={styles.thumbGrid}>
                  {photos.map((f, i) => (
                    <PhotoThumb key={`${f.name}-${f.size}-${i}`} file={f}
                      onRemove={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} />
                  ))}
                </div>
              )}
              {video && <VideoPreview file={video} onRemove={() => setVideo(null)} />}
              {tooBigPhoto && <p className={styles.error} role="alert">{tooBigPhoto.name} is over 15MB — pick a smaller file.</p>}
              {badVideo && <p className={styles.error} role="alert">That video is over 200MB — trim it or pick another.</p>}
              <label className={styles.field}>
                <span>Email *</span>
                <input type="email" required value={form.email} maxLength={120}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.nz" autoComplete="email" inputMode="email" />
              </label>
              <label className={styles.field}>
                <span>Mobile (for upload credit + photo-live texts)</span>
                <input type="tel" value={form.phone} maxLength={20}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="e.g. 021 123 456" autoComplete="tel" />
              </label>
              <div className={styles.twoCol}>
                <label className={styles.field}>
                  <span>Rider (optional)</span>
                  <input type="text" value={form.rider} maxLength={120}
                    onChange={(e) => setForm({ ...form, rider: e.target.value })}
                    placeholder="e.g. Jessie Goggin" autoComplete="off" />
                </label>
                <label className={styles.field}>
                  <span>Horse (optional)</span>
                  <input type="text" value={form.horse} maxLength={120}
                    onChange={(e) => setForm({ ...form, horse: e.target.value })}
                    placeholder="e.g. Tiraumea My Beau" autoComplete="off" />
                </label>
              </div>
              <label className={styles.consent}>
                <input type="checkbox" checked={form.consent}
                  onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                <span>
                  I took this content (or I have the right to share it) and the people visible —
                  especially children — are happy for it to appear on Boss Media. *
                </span>
              </label>
              {err && <p className={styles.error} role="alert">{err}</p>}
              {phase && <p className={styles.phase} role="status">{phase}</p>}
              <button type="submit" disabled={!canSubmit} className={styles.primary}>
                {busy ? 'Sending…' : 'Send for review'}
              </button>
              <p className={styles.fine}>
                Our team reviews every community upload before it goes live. <Link href="/privacy">How we handle your details</Link>
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
