'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../lib/api';
import { useFocusTrap } from '../lib/focus-trap';
import SponsorPhoto, { TEMPLATE_VARIANTS, OVERLAY_VARIANTS, THEMED_VARIANTS, templateOf, saveDesign, loadDesign } from './SponsorTemplates';

const toSponsors = (list) => (list || []).map((l) => ({
  id: l.id, label: l.label, src: `${API}/api/sponsor-logos/${l.id}/file`,
}));

// Satu layar tanpa scroll: preview rasio asli (fit), carousel thumbnail
// ikut rasio foto, tombol Save. Satu logo — sudah dipilih di checkout.
// Portal ke body agar selalu di atas navbar sticky (globals.css frozen).
export default function LogoModal({ open, onClose, logos, logoIds, logoPos = {}, template, setTemplate, theme, setTheme, photo, meta, mediaId, onSave, ownedDesigns = [] }) {
  const rootRef = useRef(null);
  const stripRef = useRef(null);
  // Aspek foto asli (dari probe preview) — thumbnail ikut rasio yang sama.
  const [photoAr, setPhotoAr] = useState(null);
  // Draft: browsing template tidak mengubah halaman sampai Save diklik.
  const [draft, setDraft] = useState(template);
  const [draftTheme, setDraftTheme] = useState(theme === 'dark' ? 'dark' : 'light');
  // Posisi logo draft — hanya varian overlay yang menghormatinya.
  const [draftPos, setDraftPos] = useState('bottom-left');
  useFocusTrap(rootRef, { onClose, active: open });
  const previewMeta = { event: meta?.event, className: meta?.className, result: meta?.result || '', moment: meta?.moment || '', subject: meta?.subject };
  // Owned designs (this photo + current logo): exact variant match only.
  // Every winner variant is its own design; legacy rows (no stored
  // variant, generic bake) never block an exact draft.
  const logoSetOf = (ids) => (ids || []).map(String).sort().join();
  const themeOk = (o, themeValue, variantId) =>
    !THEMED_VARIANTS.includes(variantId) || (o.theme || 'light') === (themeValue || 'light');
  const exactHit = (variantId, themeValue) => (ownedDesigns || []).some((o) =>
    o.variant && o.variant === variantId
    && logoSetOf(o.logoIds) === logoSetOf(logoIds)
    && themeOk(o, themeValue, variantId));
  // Winner jujur: grup Winner (dan Sponsor yang di-bake sebagai poster
  // winner) hanya tampil bila foto ini ditandai momen 'win'. Template kelas
  // hanya tampil bila foto ini bertag kelas.
  const showWinners = previewMeta.moment === 'win';
  const hasClass = Boolean(meta?.className);
  const aspectKey = !photoAr ? 'wide' : photoAr.h > photoAr.w * 1.15 ? 'tall' : Math.abs(photoAr.w / photoAr.h - 1) < 0.2 ? 'square' : 'wide';
  const RECOMMENDED = {
    tall: ['portrait-swoosh', 'portrait-drape', 'minimal-corner'],
    wide: ['banner-wave', 'square-bar', 'top-banner'],
    square: ['square-bar', 'minimal-corner', 'gold-frame'],
  }[aspectKey];
  const available = TEMPLATE_VARIANTS.filter((t) => {
    if (t.needsClass && !hasClass) return false;
    if (!showWinners && (t.group === 'Winner' || templateOf(t.id) === 'winner')) return false;
    return true;
  });
  const rank = (t) => {
    if (hasClass && t.id === 'class-spotlight') return -3;
    if (showWinners && t.group === 'Winner') return -2;
    const i = RECOMMENDED.indexOf(t.id);
    return i === -1 ? 99 : i;
  };
  const ordered = [...available].sort((a, b) => rank(a) - rank(b));
  const ownedHit = (variantId, themeValue) => exactHit(variantId, themeValue);
  const draftOwned = ownedHit(draft, draftTheme);
  useEffect(() => {
    if (!open) return;
    const th = theme === 'dark' ? 'dark' : 'light';
    setDraft(template);
    setDraftTheme(th);
    setDraftPos(logoIds[0] ? logoPos[logoIds[0]] || 'bottom-left' : 'bottom-left');
    // Tanpa desain tersimpan: foto win dapat layout winner, foto bertag
    // kelas dapat spotlight kelas, sisanya rekomendasi aspek foto.
    // Desain yang sudah dibeli tidak pernah jadi pilihan awal.
    let next = template;
    if (!loadDesign(mediaId)) {
      next = showWinners ? 'winner-banner' : hasClass ? 'class-spotlight' : RECOMMENDED[0];
      setDraft(next);
    }
    if (ownedHit(next, th)) {
      const alt = ordered.find((t) => !ownedHit(t.id, th));
      if (alt) setDraft(alt.id);
    }
  }, [open, mediaId, template, theme]);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open ]);
  if (!open || typeof document === 'undefined') return null;
  const picked = logos.filter((l) => logoIds.includes(l.id));
  const sponsors = toSponsors(picked.length ? picked : logos.slice(0, 1));
  const draftPositions = logoIds[0] ? { [logoIds[0]]: draftPos } : {};
  // Thumbnail selebar proporsional: portrait lebih ramping agar baris
  // carousel tetap pendek; landscape ikut 16/10 seperti mockup.
  const thumbRatio = photoAr ? `${photoAr.w} / ${photoAr.h}` : '16 / 10';
  const thumbWidth = photoAr && photoAr.h > photoAr.w * 1.15 ? 118 : 168;
  const themed = THEMED_VARIANTS.includes(draft);
  // Preview sebesar mungkin tanpa crop: fit ke tinggi ruang sisa
  // (width-fit berisiko kepotong bawah saat viewport pendek).
  const previewFrame = { height: '100%', width: 'auto', maxWidth: '100%' };
  const save = () => {
    const pos = logoIds[0] ? { [logoIds[0]]: draftPos } : {};
    setTemplate(draft);
    setTheme?.(draftTheme);
    saveDesign(mediaId, { template: draft, logoIds, logoPos: pos, theme: draftTheme });
    onSave?.({ template: draft, logoIds: [...logoIds], logoPos: pos, theme: draftTheme });
    onClose?.();
  };
  return createPortal(
    // flex-start + kartu full-height flex column: konten selalu muat,
    // tidak ada scroll halaman maupun kartu.
    <div className="st-modal" ref={rootRef} role="dialog" aria-modal="true" aria-label="Design your sponsor photo"
      style={{ zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, color: '#fff', colorScheme: 'dark' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="st-modal-card st-modal-card-xwide" role="document" onClick={(e) => e.stopPropagation()}
        style={{ margin: 0, height: 'calc(100dvh - 32px)', maxHeight: 860, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header className="st-modal-head" style={{ marginBottom: 12 }}>
          <div className="st-modal-title">
            <p className="eyebrow">Sponsor design</p>
            <h3>Design your photo</h3>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
          {/* Rasio asli foto, sebesar mungkin di ruang sisa — tidak di-crop. */}
          <SponsorPhoto photo={photo} variant={draft} ratio={null}
            frameStyle={previewFrame} theme={draftTheme}
            onAspect={setPhotoAr}
            sponsors={sponsors} positions={draftPositions}
            event={previewMeta.event} className={previewMeta.className}
            result={previewMeta.result} subject={previewMeta.subject} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 10, minHeight: 40 }}>
          <p className="purchase-label" style={{ margin: 0, color: '#9a9a9a' }}>Choose a template</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {themed && (
              <div role="radiogroup" aria-label="Strip theme" style={{ display: 'flex', gap: 6 }}>
                {[['Light', 'light'], ['Dark', 'dark']].map(([label, v]) => (
                  <button key={v} type="button" role="radio" aria-checked={draftTheme === v}
                    onClick={() => setDraftTheme(v)}
                    style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff',
                      background: draftTheme === v ? '#2a2a2a' : 'transparent',
                      border: draftTheme === v ? '1px solid #fff' : '1px solid #3a3a3a' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {OVERLAY_VARIANTS.includes(draft) ? (
            <div role="radiogroup" aria-label="Logo position" style={{ display: 'flex', gap: 6 }}>
              {[['Bottom bar', 'bottom-left'], ['Corner', 'bottom-right'], ['Top', 'top-right']].map(([label, pos]) => (
                <button key={pos} type="button" role="radio" aria-checked={draftPos === pos}
                  onClick={() => setDraftPos(pos)}
                  style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff',
                    background: draftPos === pos ? '#2a2a2a' : 'transparent',
                    border: draftPos === pos ? '1px solid #fff' : '1px solid #3a3a3a' }}>
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, color: '#9a9a9a', fontSize: 12 }}>{showWinners ? `${ordered.length} designs · winner + sponsor` : `${ordered.length} sponsor designs`}</p>
          )}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <div ref={stripRef} role="radiogroup" aria-label="Design template"
            style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '10px 2px 2px', scrollBehavior: 'smooth' }}>
            {ordered.map((t) => {
              const isOwned = ownedHit(t.id, draftTheme);
              return (
              <button key={t.id} type="button" role="radio" aria-checked={draft === t.id}
                disabled={isOwned} aria-disabled={isOwned}
                onClick={() => setDraft(t.id)} aria-label={`${t.name}: ${t.desc}${isOwned ? ' (owned)' : ''}`}
                title={isOwned ? 'You already own this design' : undefined}
                style={{
                  position: 'relative', flex: 'none', width: thumbWidth,
                  cursor: isOwned ? 'not-allowed' : 'pointer', color: 'inherit', opacity: isOwned ? 0.75 : 1,
                  font: 'inherit', textAlign: 'left', background: '#101010', padding: 10,
                  border: draft === t.id ? '1px solid #fff' : '1px solid #3a3a3a',
                  boxShadow: draft === t.id ? 'inset 0 0 0 1px #fff' : 'none',
                }}>
                {isOwned && (
                  <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, background: '#1d7a34', color: '#fff',
                    fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 20 }}>✓ Owned</span>
                )}
                <SponsorPhoto photo={photo} variant={t.id} ratio={thumbRatio} compact
                  theme={draftTheme}
                  sponsors={sponsors} positions={draftPositions}
                  event={previewMeta.event} className={previewMeta.className}
                  result={previewMeta.result} subject={previewMeta.subject} />
                <div style={{ marginTop: 8 }}>
                  <strong style={{ display: 'block', fontSize: 12 }}>{t.short}</strong>
                  <small style={{ display: 'block', color: '#9a9a9a', fontSize: 11, marginTop: 2 }}>
                    {RECOMMENDED.includes(t.id) ? 'Recommended · ' : ''}Bakes as {templateOf(t.id)}
                  </small>
                </div>
              </button>
              );
            })}
          </div>
          <button type="button" aria-label="Scroll templates right"
            onClick={() => stripRef.current?.scrollBy({ left: 380, behavior: 'smooth' })}
            style={{
              position: 'absolute', right: -6, top: '32%', width: 36, height: 36, borderRadius: '50%',
              border: '1px solid #555', background: '#1c1c1c', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1,
            }}>›</button>
        </div>

        <footer className="st-modal-foot" style={{ marginTop: 10, paddingTop: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, minHeight: 60 }}>
          {draftOwned && (
            <span style={{ fontSize: 12, color: '#e08a8a', marginRight: 'auto' }}>
              You already own this design — pick another template.
            </span>
          )}
          <button type="button" className="st-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="st-btn" style={{ flex: 'none' }} onClick={save} disabled={draftOwned}>Save design</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
