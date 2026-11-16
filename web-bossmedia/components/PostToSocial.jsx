'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../lib/api';
import { safeError } from '../lib/errors';
import SmartImage from './SmartImage';

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
  const [heroAr, setHeroAr] = useState(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    setErr(''); setDone(null); setBusy(false); setHeroAr(null);
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
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

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
    <div role="dialog" aria-modal="true" aria-label="Post photo" onClick={onClose}
      style={backdrop}>
      <div onClick={(e) => e.stopPropagation()} style={dialog}>
        {done ? (
          <div style={{ padding: '30px 26px 26px', textAlign: 'center' }}>
            <span style={checkBadge} aria-hidden="true">✓</span>
            <p className="eyebrow" style={{ marginTop: 16 }}>Posted</p>
            <h3 style={{ margin: '6px 0 0', fontSize: 24 }}>Live on {provider === 'ig' ? 'Instagram' : 'Facebook'}.</h3>
            <p style={{ margin: '8px 0 0', color: '#bbb', fontSize: 13, lineHeight: 1.6 }}>
              {media.title || 'Your photo'} is now on your {provider === 'ig' ? 'Instagram' : 'Facebook Page'}.
              Insights land in Account &gt; Posts overnight.
            </p>
            <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
              {done.post_url ? (
                <a className="st-btn" href={done.post_url} target="_blank" rel="noreferrer"
                  style={{ textDecoration: 'none', minHeight: 46, display: 'grid', placeItems: 'center' }}>
                  View post
                </a>
              ) : null}
              <Link href="/account" className="st-btn-ghost" onClick={onClose}
                style={{ textDecoration: 'none', minHeight: 46, display: 'grid', placeItems: 'center' }}>
                Track in Account &gt; Posts
              </Link>
              <button type="button" onClick={onClose} className="text-link" style={{ justifySelf: 'center' }}>
                Done
              </button>
            </div>
          </div>
        ) : (
        <>
        <div style={{ ...hero, ...(heroAr ? { aspectRatio: heroAr } : null) }}>
          {media.thumb
            ? <SmartImage src={media.thumb} alt={media.title || 'Photo to post'} fill sizes="(max-width: 640px) 100vw, 560px"
              onLoad={(e) => {
                const w = e?.currentTarget?.naturalWidth, h = e?.currentTarget?.naturalHeight;
                if (w && h) setHeroAr(`${w} / ${h}`);
              }} />
            : <span className="cover-fallback">Boss Media</span>}
          <button type="button" onClick={onClose} aria-label="Close"
            style={heroClose}>✕</button>
        </div>

        <div style={{ padding: '18px 22px 22px' }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>Post to social.</h3>
          <p style={{ margin: '6px 0 0', color: '#bbb', fontSize: 13, lineHeight: 1.6 }}>
            <strong style={{ color: '#fff' }}>{media.title || 'Your photo'}</strong>
            {media.sub ? <><br />{media.sub}</> : null}
            <br />Posts to your account. Caption is yours — edit freely.
          </p>

          {err && <p className="auth-error" role="alert" style={{ marginTop: 14 }}>{safeError(err)}</p>}

        {accounts === null ? (
          <p className="empty-note" style={{ marginTop: 14 }}>Checking connected accounts…</p>
        ) : !accounts.length ? (
          <div style={{ marginTop: 14 }}>
            <p className="empty-note">Not connected yet — connect once, then post from here.</p>
            <Link href="/account" className="st-btn" onClick={onClose} style={{ textDecoration: 'none' }}>Connect in Account</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }} role="group" aria-label="Where to post">
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
            <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
              <span style={labelStyle}>Caption · {caption.length}/2200</span>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
                rows={4} style={textarea} spellCheck={false} />
            </label>
            {provider === 'ig' && (
              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span style={labelStyle}>Tag accounts · optional, up to 5</span>
                <input value={tagText} onChange={(e) => setTagText(e.target.value.slice(0, 160))}
                  placeholder="@rider, @sponsor" spellCheck={false} autoComplete="off"
                  style={{ ...textarea, resize: 'none' }} />
              </label>
            )}
            <button type="button" className="st-btn" disabled={busy || !connected.includes(provider)}
              onClick={post} style={{ minHeight: 46, width: '100%', marginTop: 14 }}>
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

const checkBadge = {
  display: 'inline-grid', placeItems: 'center', width: 56, height: 56, borderRadius: '50%',
  background: '#8fd694', color: '#101010', fontSize: 24, fontWeight: 700,
};

const backdrop = {
  position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.72)',
  display: 'grid', placeItems: 'center', padding: 16,
};
const dialog = {
  width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
  background: '#101010', border: '1px solid #2c2c2c', borderRadius: 14, overflow: 'hidden',
};
const hero = {
  position: 'relative', aspectRatio: '16 / 9', background: '#000',
  borderBottom: '1px solid #2c2c2c',
};
const heroClose = {
  position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: '50%',
  border: '1px solid rgba(255,255,255,.25)', background: 'rgba(0,0,0,.55)', color: '#fff',
  cursor: 'pointer', fontSize: 14,
};
const labelStyle = { color: '#888', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' };
const textarea = {
  color: '#fff', background: '#0b0b0b', border: '1px solid #333', borderRadius: 8,
  padding: 10, fontSize: 13, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit',
};
