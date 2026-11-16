'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../lib/api';
import { nzd } from '../lib/figma-data';
import { MAX_SPONSOR_LOGOS, isWinningResult, normalizeTagDraft, toggleLogoIds } from '../lib/sponsor-logos.mjs';
import { useFocusTrap } from '../lib/focus-trap';
import { useToast } from './Toaster';
import SmartImage from './SmartImage';
import TagEditor from './TagEditor';
import m from './LogoModal.module.css';
import SponsorPhoto, { TEMPLATE_VARIANTS, OVERLAY_VARIANTS, THEMED_VARIANTS, templateOf, clearDesign, saveDesign, loadDesign } from './SponsorTemplates';

const toSponsors = (list) => (list || []).map((l) => ({
  id: l.id, label: l.label, src: `${API}/api/sponsor-logos/${l.id}/file`,
}));

// Satu layar tanpa scroll: preview rasio asli (fit), carousel thumbnail
// ikut rasio foto, tombol Save. Semua pilihan desain ada di sini: 1–8 logo
// (posisi per logo sampai 4 sudut, tabrakan bertukar tempat otomatis;
// logo ke-5+ ikut baris yang sama di posisi pertama) + tag kelas/menang.
// Browsing tidak mengubah halaman sampai Save diklik. Portal ke body agar
// selalu di atas navbar sticky (globals.css frozen).
const LOGO_POSITIONS = ['bottom-left', 'bottom-right', 'top-right', 'top-left'];
export default function LogoModal({ open, onClose, logos, logoIds, logoPos = {}, template, setTemplate, theme, setTheme, photo, meta, mediaId, onSave, ownedDesigns = [], tags = null, discountCents = {}, onOwnLogos, onOwnRemoved }) {
  const rootRef = useRef(null);
  const toast = useToast();
  // Draft logo + tag: diisi dari desain tersimpan saat modal dibuka,
  // ditulis balik (parent + localStorage) hanya saat Save.
  const [draftLogos, setDraftLogos] = useState([]);
  const [draftTags, setDraftTags] = useState({ class: '', result: '' });
  // Sponsor tabs: event logos (discount-backed, shared) vs the buyer's own
  // uploads (saved to their account, visible only to them).
  const [spTab, setSpTab] = useState('event');
  // Aspek foto asli (dari probe preview) — thumbnail ikut rasio yang sama.
  const [photoAr, setPhotoAr] = useState(null);
  // Draft: browsing template tidak mengubah halaman sampai Save diklik.
  // Buyer-nominated upload (§2.2): label + file for the client's own
  // sponsor; lands in THEIR picker only (server scopes personal rows).
  // The form hides behind one button — the tab lists saved sponsors first.
  const [showUpload, setShowUpload] = useState(false);
  const [upLabel, setUpLabel] = useState('');
  const [upFile, setUpFile] = useState(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upErr, setUpErr] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const removeOwnLogo = async (id) => {
    if (removingId) return;
    setRemovingId(id);
    try {
      const res = await fetch(`${API}/api/my/sponsor-logos/${id}`, { method: 'DELETE', credentials: 'include' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Remove failed — try again.');
      onOwnRemoved?.(id);
      setDraftLogos((v) => v.filter((x) => String(x) !== String(id)));
    } catch (e) { toast(e.message, { type: 'error' }); } finally { setRemovingId(null); }
  };
  const uploadOwnLogo = async () => {
    if (upBusy) return;
    const label = upLabel.trim();
    if (label.length < 2) { setUpErr('Name the brand first — at least 2 characters.'); return; }
    if (!upFile) { setUpErr('Pick a logo file first — Browse… above, then Upload.'); return; }
    if (upFile.size > 2 * 1024 * 1024) { setUpErr('That file is over 2MB — pick a smaller PNG or JPEG.'); return; }
    setUpBusy(true); setUpErr('');
    try {
      const fd = new FormData();
      fd.append('label', label.slice(0, 100));
      fd.append('logo', upFile);
      const res = await fetch(`${API}/api/my/sponsor-logos`, { method: 'POST', credentials: 'include', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Upload failed — try again.');
      const row = { id: j.data.id, label: j.data.label, sponsor_name: j.data.sponsor_name, mine: true };
      onOwnLogos?.(row);
      const r = toggleLogoIds(draftLogos, row.id);
      if (r.full) toast(`Design is full (${MAX_SPONSOR_LOGOS} logos) — your upload is saved, remove one to use it.`, { type: 'info' });
      else setDraftLogos(r.ids);
      setUpLabel(''); setUpFile(null);
      setShowUpload(false);
    } catch (e) { setUpErr(e.message); } finally { setUpBusy(false); }
  };
  const [draft, setDraft] = useState(template);
  const [draftTheme, setDraftTheme] = useState(theme === 'dark' ? 'dark' : 'light');
  // Posisi logo draft per logo ({logoId: pos}) — hanya varian overlay
  // yang menghormatinya. Strip/panel punya layout tetap.
  const [draftPos, setDraftPos] = useState({});
  // Satu posisi satu logo: yang tabrakan bertukar tempat.
  const setDraftPosFor = (id, pos) => setDraftPos((v) => {
    const next = { ...v, [id]: pos };
    for (const other of Object.keys(next)) {
      if (other !== String(id) && next[other] === pos) next[other] = v[id] || 'bottom-left';
    }
    return next;
  });
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
    && logoSetOf(o.logoIds) === logoSetOf(draftLogos)
    && themeOk(o, themeValue, variantId));
  // Tag draft mengendalikan daftar template langsung: centang "Won it"
  // membuka grup Winner, isi kelas membuka Class spotlight — sebelum Save.
  const draftClass = draftTags.class.trim() || meta?.className || '';
  const draftWon = isWinningResult(draftTags.result) || previewMeta.moment === 'win';
  const draftResult = draftTags.result.trim() || previewMeta.result || '';
  // Semua 19 template selalu tampil — win/class hanya menaikkan ranking,
  // bukan menyembunyikan. Pilihan buyer, desain buyer.
  const showWinners = draftWon;
  const hasClass = Boolean(draftClass);
  const aspectKey = !photoAr ? 'wide' : photoAr.h > photoAr.w * 1.15 ? 'tall' : Math.abs(photoAr.w / photoAr.h - 1) < 0.2 ? 'square' : 'wide';
  const RECOMMENDED = {
    tall: ['portrait-swoosh', 'portrait-drape', 'minimal-corner'],
    wide: ['banner-wave', 'square-bar', 'top-banner'],
    square: ['square-bar', 'minimal-corner', 'gold-frame'],
  }[aspectKey];
  const rank = (t) => {
    if (hasClass && t.id === 'class-spotlight') return -3;
    if (showWinners && t.group === 'Winner') return -2;
    if (t.group === 'Winner') return 98;
    const i = RECOMMENDED.indexOf(t.id);
    return i === -1 ? 99 : i;
  };
  const ordered = [...TEMPLATE_VARIANTS].sort((a, b) => rank(a) - rank(b));
  const ownedHit = (variantId, themeValue) => exactHit(variantId, themeValue);
  const draftOwned = ownedHit(draft, draftTheme);
  const toggleDraftLogo = (id) => {
    const r = toggleLogoIds(draftLogos, id);
    if (r.full) {
      toast(`Up to ${MAX_SPONSOR_LOGOS} sponsor logos per photo — remove one to add another.`, { type: 'info' });
      return;
    }
    setDraftLogos(r.ids);
  };
  useEffect(() => {
    if (!open) return;
    const th = theme === 'dark' ? 'dark' : 'light';
    setDraft(template);
    setDraftTheme(th);
    setDraftLogos([...logoIds]);
    setDraftTags(normalizeTagDraft(tags));
    setSpTab('event');
    setShowUpload(false);
    setDraftPos(Object.fromEntries(logoIds.map((id, i) => [id, logoPos[id] || LOGO_POSITIONS[i % LOGO_POSITIONS.length]])));
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
  // Sel preview diukur (contain-fit terukur) — hook di atas early return
  // agar urutan hook stabil saat modal buka/tutup.
  const cellRef = useRef(null);
  const [cellBox, setCellBox] = useState(null);
  useEffect(() => {
    if (!open || !cellRef.current) return undefined;
    const ro = new ResizeObserver((es) => {
      const r = es[0].contentRect;
      setCellBox({ w: r.width, h: r.height });
    });
    ro.observe(cellRef.current);
    return () => ro.disconnect();
  }, [open ]);
  if (!open || typeof document === 'undefined') return null;
  const picked = logos.filter((l) => draftLogos.includes(l.id));
  // Belum pilih = placeholder netral YOUR LOGO (dari SponsorPhoto),
  // bukan logo pertama. Menampilkan PaknSave padahal belum dipilih
  // mengimplikasikan diskon yang tidak ada.
  const sponsors = toSponsors(picked);
  const draftPositions = draftPos;
  const eventLogos = logos.filter((l) => !l.mine);
  const myLogos = logos.filter((l) => l.mine);
  // Yang terpilih menempel di atas — daftar panjang tetap enak dijelajah.
  const tabLogos = (spTab === 'mine' ? myLogos : eventLogos).slice().sort(
    (a, b) => Number(draftLogos.includes(b.id)) - Number(draftLogos.includes(a.id)));
  // Thumbnail ikut rasio asli foto; foto tegak dibatasi lebarnya agar
  // list vertikal tetap enak di-scroll.
  const thumbRatio = photoAr ? `${photoAr.w} / ${photoAr.h}` : '16 / 10';
  const tallPhoto = photoAr && photoAr.h > photoAr.w * 1.15;
  const themed = THEMED_VARIANTS.includes(draft);
  // Preview selalu serasio foto asli (contain-fit terukur): height:100% +
  // max-width memecah rasio saat lebar dikepotong (terukur 1.405 vs 1.499),
  // jadi sel diukur lalu bingkai dihitung pas — tak pernah crop, tak pecah.
  const previewFrame = (() => {
    if (!photoAr || !cellBox || cellBox.w <= 0 || cellBox.h <= 0) {
      return { width: '100%', aspectRatio: photoAr ? `${photoAr.w} / ${photoAr.h}` : undefined };
    }
    const ar = photoAr.w / photoAr.h;
    let w = cellBox.w, h = w / ar;
    if (h > cellBox.h) { h = cellBox.h; w = h * ar; }
    return { width: Math.max(1, Math.floor(w)), height: Math.max(1, Math.floor(h)) };
  })();
  // Whole-design remove (the page has the same action): clears the saved
  // draft and reports empty selection upward — preview returns to plain.
  const removeAll = () => {
    clearDesign(mediaId);
    onSave?.({ template: draft, logoIds: [], logoPos: {}, theme: draftTheme, tags: { class: '', result: '' } });
    onClose?.();
  };
  const save = () => {
    if (!draftLogos.length) {
      toast('Pick at least one sponsor logo — or Cancel to keep the photo plain.', { type: 'info' });
      return;
    }
    const pos = Object.fromEntries(draftLogos.map((id, i) => [id, draftPos[id] || LOGO_POSITIONS[i % LOGO_POSITIONS.length]]));
    setTemplate(draft);
    setTheme?.(draftTheme);
    saveDesign(mediaId, { template: draft, logoIds: [...draftLogos], logoPos: pos, theme: draftTheme, tags: draftTags });
    onSave?.({ template: draft, logoIds: [...draftLogos], logoPos: pos, theme: draftTheme, tags: draftTags });
    onClose?.();
  };
  return createPortal(
    // flex-start + kartu full-height flex column: konten selalu muat,
    // tidak ada scroll halaman maupun kartu.
    <div className="st-modal" ref={rootRef} role="dialog" aria-modal="true" aria-label="Design your sponsor photo"
      style={{ zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, color: '#fff', colorScheme: 'dark' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`st-modal-card st-modal-card-xwide ${m.card}`} role="document" onClick={(e) => e.stopPropagation()}
        style={{ margin: 0, height: 'calc(100dvh - 32px)', maxHeight: 900, width: 'min(1400px, 96vw)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header className="st-modal-head" style={{ marginBottom: 8 }}>
          <div className="st-modal-title">
            <p className="eyebrow">Sponsor design</p>
            <h3>Design your photo</h3>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: 12, flexWrap: 'wrap', overflow: 'hidden' }}>
          <div ref={cellRef} style={{ flex: '1 1 380px', minWidth: 0, minHeight: 280, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            {/* Rasio asli foto, sebesar mungkin di ruang sisa — tidak di-crop. */}
            <SponsorPhoto photo={photo} variant={draft} ratio={null}
              frameStyle={previewFrame} theme={draftTheme}
              onAspect={setPhotoAr}
              sponsors={sponsors} positions={draftPositions}
              event={previewMeta.event} className={draftClass}
              result={draftResult} subject={previewMeta.subject} />
          </div>
          <aside style={{ flex: '1 1 280px', maxWidth: 360, minWidth: 0, minHeight: 0, height: '100%', overflowY: 'auto', display: 'grid', gap: 12, alignContent: 'start', paddingRight: 2 }}>
            <div>
              <div role="tablist" aria-label="Sponsor sources" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {[['event', `Event sponsors${eventLogos.length ? ` (${eventLogos.length})` : ''}`], ['mine', `My sponsors${myLogos.length ? ` (${myLogos.length})` : ''}`]].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={spTab === id} onClick={() => setSpTab(id)}
                    className={m.pick} style={{ padding: '6px 10px' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Pick sponsor logos" style={{ display: 'grid', gap: 8 }}>
                {tabLogos.length === 0 && (
                  <p style={{ margin: 0, color: '#999', fontSize: 12, lineHeight: 1.6 }}>
                    {spTab === 'mine'
                      ? 'No saved sponsors yet — upload your first below. It stays on your account.'
                      : 'No event sponsor carries a funded discount for this photo.'}
                  </p>
                )}
                {tabLogos.map((l) => {
                  const on = draftLogos.includes(l.id);
                  const dc = discountCents?.[l.id];
                  return (
                  <div key={l.id}>
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleDraftLogo(l.id)}
                      aria-label={`${l.label} logo${on ? ' (picked)' : ''}${l.mine ? ' (yours)' : ''}`}
                      className={`${m.pick} ${m.chip}`}>
                      <span className={m.chipThumb}>
                        <SmartImage src={`${API}/api/sponsor-logos/${l.id}/file`} alt={`${l.label} logo`} width={56} height={28}
                          unoptimized style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                      </span>
                      <span className={m.chipLabel}>
                        {l.label}{l.mine ? ' · yours' : dc ? ` −${nzd(dc)}` : ''}
                      </span>
                    </button>
                    {l.mine && (
                      <button type="button" onClick={() => removeOwnLogo(l.id)} disabled={removingId === l.id}
                        style={{ marginTop: 6, background: 'none', border: 0, padding: '0 0 2px', color: '#999', fontSize: 12, borderBottom: '1px solid #444', cursor: 'pointer' }}>
                        {removingId === l.id ? 'Removing…' : `Remove ${l.label} logo`}
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
              {spTab === 'mine' && (
                showUpload ? (
                  <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  <label style={{ display: 'grid', gap: 6, color: '#999', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Brand name
                    <input className={m.field} value={upLabel} onChange={(e) => setUpLabel(e.target.value.slice(0, 100))} placeholder="e.g. My Stable Vets" maxLength={100} />
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                    <span style={{ display: 'grid', gap: 6, color: '#999', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.09em' }}>Logo file · PNG/JPEG ≤2MB
                      <span className={m.dropWrap}>
                        <span className={m.dropText} aria-live="polite">{upFile ? upFile.name : 'No file chosen — click to browse…'}</span>
                        <input type="file" accept="image/png,image/jpeg" onChange={(e) => { setUpFile(e.target.files?.[0] || null); setUpErr(''); }}
                          className={m.fileGhost} aria-label="Logo file, PNG or JPEG up to 2MB" />
                      </span>
                    </span>
                    <button type="button" onClick={uploadOwnLogo} disabled={upBusy} className={m.outlineBtn}>
                      {upBusy ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                  {upErr && <p role="alert" style={{ margin: 0, color: '#e08a8a', fontSize: 12 }}>{upErr}</p>}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button type="button" onClick={() => { setShowUpload(false); setUpErr(''); }}
                      style={{ background: 'none', border: 0, padding: 0, color: '#999', fontSize: 12, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <p style={{ margin: 0, color: '#999', fontSize: 11 }}>Saved to your account — visible only to you.</p>
                  </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowUpload(true)} className={m.addNew}>
                    {myLogos.length ? '+ Add new sponsor' : '+ Add your first sponsor'}
                  </button>
                )
              )}
            </div>
            <div>
              <p className="purchase-label" style={{ margin: '0 0 6px' }}>Photo tags <span style={{ color: '#9a9a9a' }}>· for this design, empty = original</span></p>
              <TagEditor value={draftTags} onChange={setDraftTags} />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, position: 'sticky', top: 0, background: '#141414', paddingBottom: 8, zIndex: 1 }}>
                <p className="purchase-label" style={{ margin: 0 }}>Choose a template</p>
                <p style={{ margin: 0, color: '#999', fontSize: 11 }}>{ordered.length} designs · scroll for more ↓</p>
              </div>
              {themed && (
              <div role="radiogroup" aria-label="Strip theme" style={{ display: 'flex', gap: 6 }}>
                {[['Light', 'light'], ['Dark', 'dark']].map(([label, v]) => (
                  <button key={v} type="button" role="radio" aria-checked={draftTheme === v}
                    onClick={() => setDraftTheme(v)} className={m.pick} style={{ padding: '6px 10px' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {OVERLAY_VARIANTS.includes(draft) && picked.length > 0 && (
              <div role="group" aria-label="Logo positions" style={{ display: 'grid', gap: 6 }}>
                {picked.map((l) => (
                  <div key={l.id || 'default'} role="radiogroup" aria-label={`${l.label || 'Logo'} position`}
                    style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                    {picked.length > 1 && (
                      <span style={{ marginRight: 'auto', color: '#999', fontSize: 12, fontWeight: 700,
                        maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.label}
                      </span>
                    )}
                    {[['Bottom left', 'bottom-left'], ['Bottom right', 'bottom-right'], ['Top right', 'top-right'], ['Top left', 'top-left']].map(([label, pos]) => (
                      <button key={pos} type="button" role="radio" aria-checked={(draftPos[l.id] || 'bottom-left') === pos}
                        onClick={() => setDraftPosFor(l.id, pos)} className={m.pick} style={{ padding: '6px 10px' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div role="radiogroup" aria-label="Design template" style={{ display: 'grid', gap: 10 }}>
              {ordered.map((t) => {
                const isOwned = ownedHit(t.id, draftTheme);
                return (
                <button key={t.id} type="button" role="radio" aria-checked={draft === t.id}
                  disabled={isOwned} aria-disabled={isOwned}
                  onClick={() => setDraft(t.id)} aria-label={`${t.name}: ${t.desc}${isOwned ? ' (owned)' : ''}`}
                  title={isOwned ? 'You already own this design' : undefined}
                  className={m.thumb}
                  style={{
                    cursor: isOwned ? 'not-allowed' : 'pointer', opacity: isOwned ? 0.75 : 1,
                  }}>
                  {isOwned && (
                    <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 2, background: '#e3b341', color: '#101010',
                      fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 20 }}>✓ Owned</span>
                  )}
                  {draft === t.id && !isOwned && (
                    <span className={m.currentPill}>Current</span>
                  )}
                  <span style={{ display: 'block', width: '100%', maxWidth: tallPhoto ? 200 : undefined, margin: '0 auto' }}>
                    <SponsorPhoto photo={photo} variant={t.id} ratio={thumbRatio}
                      theme={draftTheme}
                      sponsors={sponsors} positions={draftPositions}
                      event={previewMeta.event} className={draftClass}
                      result={draftResult} subject={previewMeta.subject} />
                  </span>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 8, minHeight: 18 }}>
                    <strong style={{ fontSize: 13 }}>{t.short}</strong>
                    {RECOMMENDED.includes(t.id) && (
                      <small style={{ color: '#e3b341', fontSize: 11, fontWeight: 700 }}>Recommended</small>
                    )}
                  </div>
                  </button>
                  );
                })}
              </div>
              <div aria-hidden="true" style={{ position: 'sticky', bottom: 0, height: 28, marginTop: -20, background: 'linear-gradient(transparent, #141414)', pointerEvents: 'none' }} />
            </div>
          </aside>
        </div>

        <footer className="st-modal-foot" style={{ marginTop: 10, paddingTop: 12, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, minHeight: 60 }}>
          {draftOwned && (
            <span style={{ fontSize: 12, color: '#e08a8a', marginRight: 'auto' }}>
              You already own this design — pick another template.
            </span>
          )}
          {(logoIds.length > 0 || draftLogos.length > 0) && !draftOwned && (
            <button type="button" onClick={removeAll} className={m.linkBtn} style={{ marginRight: 'auto' }}>
              Remove design
            </button>
          )}
          <button type="button" className="st-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="st-btn" style={{ flex: 'none' }} onClick={save} disabled={draftOwned}>Save design</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
