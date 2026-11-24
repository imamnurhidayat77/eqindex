'use client';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../lib/api';
import { safeError } from '../lib/errors';
import { useFocusTrap } from '../lib/focus-trap';
import SmartImage from './SmartImage';
import s from './PostToSocial.module.css';

const PROVIDERS = [['ig', 'Instagram'], ['fb_page', 'Facebook Page']];

// Button + modal pair for pages that cannot hold state (e.g. /p/[id]).
export function PostCta({ media, label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="st-btn-ghost" onClick={() => setOpen(true)}>
        {label || 'Post to social'}
      </button>
      <PostToSocial open={open} onClose={() => setOpen(false)} media={media} />
    </>
  );
}

// Post an owned photo to the buyer's own IG / FB Page, from a modal.
// Caption fully editable — posts to their account, tracked in Account > Posts.
export default function PostToSocial({ open, onClose, media }) {
  const [accounts, setAccounts] = useState(null);
  const [provider, setProvider] = useState('ig');
  const [caption, setCaption] = useState('');
  const [tagText, setTagText] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef(null);
  const titleId = useId();
  // Callers pass inline onClose; keep the trap stable so typing never refocuses.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => onCloseRef.current?.(), []);
  useFocusTrap(dialogRef, { onClose: close, active: mounted && open && !!media });

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    setErr(''); setDone(null); setBusy(false);
    setCaption(media?.caption || ''); setTagText('');
    setAccounts(null);
    fetch(`${API}/api/my/social/accounts`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const rows = j?.data || [];
        setAccounts(rows);
        if (rows.length && !rows.some((a) => a.provider === provider)) setProvider(rows[0].provider);
      })
      .catch(() => setAccounts([]));
  }, [open, media]);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted || !open || !media) return null;

  const connected = (accounts || []).map((a) => a.provider);
  const tags = tagText.split(/[\s,]+/).map((t) => t.replace(/^@/, '').trim()).filter(Boolean).slice(0, 5);
  const post = async () => {
    setErr(''); setDone(null); setBusy(true);
    try {
      const r = await fetch(`${API}/api/my/social/posts`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: media.media_id, provider, caption, ...(provider === 'ig' && tags.length ? { tags } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Post failed — try again.');
      setDone(j.data);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return createPortal(
    <div className={s.backdrop} onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={s.dialog} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className={s.done}>
            <span className={s.check} aria-hidden="true">✓</span>
            <p className="eyebrow" style={{ marginTop: 16 }}>Posted</p>
            <h3 id={titleId} className={s.doneTitle}>Live on {provider === 'ig' ? 'Instagram' : 'Facebook'}.</h3>
            <p className={s.meta} style={{ marginTop: 8 }}>
              {media.title || 'Your photo'} is now on your {provider === 'ig' ? 'Instagram' : 'Facebook Page'}.
              Insights land in Account &gt; Posts overnight.
            </p>
            <div className={s.doneActions}>
              {done.post_url ? (
                <a className={`st-btn ${s.wide}`} href={done.post_url} target="_blank" rel="noreferrer">View post</a>
              ) : null}
              <Link href="/account" className={`st-btn-ghost ${s.wide}`} onClick={onClose}>
                Track in Account &gt; Posts
              </Link>
              <button type="button" onClick={onClose} className="text-link" style={{ justifySelf: 'center' }}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={s.hero}>
              {media.thumb
                ? <SmartImage src={media.thumb} alt={media.title || 'Photo to post'} fill className={s.heroImg}
                  sizes="(max-width: 640px) 100vw, 560px" />
                : <span className="cover-fallback">Boss Media</span>}
              <button type="button" onClick={onClose} aria-label="Close" className={s.close}>✕</button>
            </div>

            <div className={s.body}>
              <h3 id={titleId} className={s.title}>Post to social.</h3>
              <p className={s.meta}>
                <strong>{media.title || 'Your photo'}</strong>
                {media.sub ? <><br />{media.sub}</> : null}
                <br />Posts to your account. Caption is yours — edit freely.
              </p>

              {err && <p className={`auth-error ${s.gap}`} role="alert">{safeError(err)}</p>}

              {accounts === null ? (
                <p className={`empty-note ${s.gap}`} role="status">Checking connected accounts…</p>
              ) : !accounts.length ? (
                <div className={s.gap}>
                  <p className="empty-note">Not connected yet — connect once, then post from here.</p>
                  <Link href="/account" className={`st-btn ${s.wide}`} onClick={onClose}>Connect in Account</Link>
                </div>
              ) : (
                <>
                  <div className={s.providers} role="group" aria-label="Where to post">
                    {PROVIDERS.map(([id, label]) => (
                      <button key={id} type="button" aria-pressed={provider === id}
                        className={provider === id ? 'st-btn' : 'st-btn-ghost'}
                        disabled={!connected.includes(id)} title={connected.includes(id) ? label : `${label} — not connected`}
                        onClick={() => setProvider(id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {!connected.includes(provider) && (
                    <p className="empty-note" style={{ marginTop: 10 }}>
                      {PROVIDERS.find(([id]) => id === provider)?.[1]} is not connected —{' '}
                      <Link href="/account" className="text-link" onClick={onClose}>connect it in Account</Link>.
                    </p>
                  )}
                  <label className={s.field}>
                    <span className={s.label}>Caption · {caption.length}/2200</span>
                    <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
                      rows={4} className={s.input} spellCheck={false} />
                  </label>
                  {provider === 'ig' && (
                    <label className={s.field}>
                      <span className={s.label}>Tag accounts · optional, up to 5</span>
                      <input value={tagText} onChange={(e) => setTagText(e.target.value.slice(0, 160))}
                        placeholder="@rider, @sponsor" spellCheck={false} autoComplete="off"
                        className={`${s.input} ${s.single}`} />
                    </label>
                  )}
                  <button type="button" className={`st-btn ${s.wide}`} disabled={busy || !connected.includes(provider)}
                    onClick={post} aria-busy={busy}>
                    {busy ? 'Posting…' : `Post to ${provider === 'ig' ? 'Instagram' : 'Facebook Page'}`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
