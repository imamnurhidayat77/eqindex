'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../lib/api';
import { nzd } from '../lib/figma-data';
import { MAX_SPONSOR_LOGOS, normalizeTagDraft, toggleLogoIds } from '../lib/sponsor-logos.mjs';
import { useFocusTrap } from '../lib/focus-trap';
import { useToast } from './Toaster';
import SmartImage from './SmartImage';
import TagEditor from './TagEditor';
import m from './LogoModal.module.css';
import SponsorPhoto, { TEMPLATE_VARIANTS, THEMED_VARIANTS, PLATE_MAX_CORNERS, templateOf, clearDesign, saveDesign, loadDesign, isPickerVariant, momentText, variantName, RECOMMENDED_BY_ASPECT, aspectKeyOf } from './SponsorTemplates';

const toSponsors = (list) => (list || []).map((l) => ({
  id: l.id, label: l.label, src: `${API}/api/sponsor-logos/${l.id}/file`,
}));

// Editor layout: the photo preview is the biggest thing on screen, one
// tab of options at a time (Template, Sponsors, Text) beside it on
// desktop and under it on phones, Save always visible. Every tap changes
// the preview live. Semua pilihan desain ada di sini: 1–8 logo
// (posisi per logo sampai 4 sudut, tabrakan bertukar tempat otomatis;
// logo ke-5+ ikut baris yang sama di posisi pertama) + tag kelas/menang.
// Browsing tidak mengubah halaman sampai Save diklik. Portal ke body agar
// selalu di atas navbar sticky (globals.css frozen).
const LOGO_POSITIONS = ['bottom-left', 'bottom-right', 'top-right', 'top-left'];
export default function LogoModal({ open, onClose, logos, logoIds, logoPos = {}, template, setTemplate, theme, setTheme, photo, meta, mediaId, onSave, ownedDesigns = [], tags = null, discountCents = {}, onOwnLogos, onOwnRemoved, signedIn = false }) {
  const rootRef = useRef(null);
  const toast = useToast();
  // Draft logo + tag: diisi dari desain tersimpan saat modal dibuka,
  // ditulis balik (parent + localStorage) hanya saat Save.
  const [draftLogos, setDraftLogos] = useState([]);
  const [draftTags, setDraftTags] = useState({ class: '', result: '' });
  // Sponsor tabs: event logos (discount-backed, shared) vs the buyer's own
  // uploads (saved to their account, visible only to them).
  const [spTab, setSpTab] = useState('event');
  // Option tab beside / under the preview: one decision at a time.
  const [tab, setTab] = useState('template');
  const pathname = usePathname();
  // Uploading a personal sponsor needs an account to attach it to —
  // guests get a sign-in prompt instead of the upload form.
  const mineLocked = spTab === 'mine' && !signedIn;
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
  // True while the template is our suggestion, false once the buyer picks.
  const autoPick = useRef(false);
  const [draftTheme, setDraftTheme] = useState(theme === 'dark' ? 'dark' : 'light');
  // Posisi logo draft per logo ({logoId: pos}) — hanya varian overlay
  // yang menghormatinya. Strip/panel punya layout tetap.
  const [draftPos, setDraftPos] = useState({});
  // Satu posisi satu logo: yang tabrakan bertukar tempat.
  const setDraftPosFor = (id, pos) => setDraftPos((v) => {
    const next = { ...v, [id]: pos };
    for (const other of Object.keys(next)) {
      if (other !== String(id) && next[other] === pos) next[other] = v[id] || defaultPos(id);
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
  // Class + moment drive every template live, before Save.
  const draftClass = draftTags.class.trim() || meta?.className || '';
  const draftResult = momentText(draftTags.result || previewMeta.result, previewMeta.moment);
  const aspectKey = aspectKeyOf(photoAr?.w, photoAr?.h);
  // Every current template fits every photo; the order puts the best fit first.
  const RECOMMENDED = RECOMMENDED_BY_ASPECT[aspectKey];
  const BEST_FIT = RECOMMENDED.slice(0, 2);
  const ordered = [...TEMPLATE_VARIANTS].sort((a, b) => RECOMMENDED.indexOf(a.id) - RECOMMENDED.indexOf(b.id));
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
    const onlyEvent = logos.filter((l) => !l.mine);
    const fresh = !logoIds.length && !loadDesign(mediaId);
    const startLogos = fresh && onlyEvent.length === 1 ? [String(onlyEvent[0].id)] : [...logoIds];
    setDraftLogos(startLogos);
    // Nothing picked yet: open on Sponsors, the one step Save needs.
    setTab(startLogos.length ? 'template' : 'sponsor');
    setDraftTags(normalizeTagDraft(tags));
    setSpTab('event');
    setShowUpload(false);
    setDraftPos(Object.fromEntries(logoIds.map((id, i) => [id, logoPos[id] || LOGO_POSITIONS[i % LOGO_POSITIONS.length]])));
    // No saved design, or a retired one: start on the best fit for this
    // photo (re-applied once the photo's aspect is measured, see below).
    // An owned design is never the starting pick.
    let next = template;
    autoPick.current = !loadDesign(mediaId) || !isPickerVariant(template);
    if (autoPick.current) {
      next = RECOMMENDED[0];
      setDraft(next);
    }
    if (ownedHit(next, th)) {
      const alt = ordered.find((t) => !ownedHit(t.id, th));
      if (alt) setDraft(alt.id);
    }
  }, [open, mediaId, template, theme]);
  // The aspect arrives after the first render: move an untouched auto pick
  // to the best fit for portrait / square photos.
  useEffect(() => {
    if (open && autoPick.current && photoAr && !ownedHit(RECOMMENDED[0], draftTheme)) setDraft(RECOMMENDED[0]);
  }, [open, aspectKey]);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open ]);
  // Keep the picked template card in view (the phone tray scrolls sideways).
  const tplRef = useRef(null);
  useEffect(() => {
    if (!open || tab !== 'template') return;
    tplRef.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [open, tab, draft]);
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
  // Template cards share one square box (--tb, set per screen in CSS); the
  // photo is contain-fit inside it.
  const thumbAr = photoAr ? photoAr.w / photoAr.h : 1.5;
  const thumbW = thumbAr >= 1 ? 'var(--tb)' : `calc(var(--tb) * ${thumbAr.toFixed(3)})`;
  // Same default corner SponsorPhoto uses for logo i.
  const defaultPos = (id) => ['bottom-left', 'bottom-right', 'top-right', 'top-left'][Math.max(0, picked.findIndex((l) => l.id === id)) % 4];
  // Preview is contain-fit in pure CSS: the cell is a size container, the
  // frame takes the largest width that still fits its height, and
  // aspect-ratio locks the shape. No measuring, so no stale sizes on any
  // screen (the old observer-based sizing could keep a size from a previous layout).
  const photoRatio = photoAr ? `${photoAr.w} / ${photoAr.h}` : null;
  const previewFrame = photoAr
    ? { width: `min(100cqw, calc(100cqh * ${photoAr.w / photoAr.h}))`, aspectRatio: photoRatio }
    : { width: '100%' };
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
        <header className={`st-modal-head ${m.head}`} style={{ marginBottom: 8 }}>
          <div className="st-modal-title">
            <p className="eyebrow">Sponsor design</p>
            <h3>Design your photo</h3>
          </div>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        </header>

        <div className={m.body}>
          <div className={m.stage}>
            <div className={m.stageBar}>
              <p className={m.stageName} aria-live="polite">{variantName(draft)}</p>
              <div role="radiogroup" aria-label="Style" className={m.seg}>
                {[['Light', 'light'], ['Dark', 'dark']].map(([label, v]) => (
                  <button key={v} type="button" role="radio" aria-checked={draftTheme === v}
                    onClick={() => setDraftTheme(v)} className={m.segBtn}>{label}</button>
                ))}
              </div>
            </div>
          <div className={m.cell} style={{ '--ar': photoRatio || '3 / 2' }}>
            {/* Rasio asli foto, sebesar mungkin di ruang sisa — tidak di-crop. */}
            {!draftLogos.length && (
              <button type="button" className={m.emptyHint} onClick={() => setTab('sponsor')}>Pick a sponsor to place their logo</button>
            )}
            <SponsorPhoto photo={photo} variant={draft} ratio={null}
              frameStyle={previewFrame} theme={draftTheme}
              onAspect={setPhotoAr}
              sponsors={sponsors} positions={draftPositions}
              event={previewMeta.event} className={draftClass}
              result={draftResult} subject={previewMeta.subject} />
          </div>
          </div>
          <section className={m.panel} aria-label="Design options">
            <div role="tablist" aria-label="Design steps" className={m.tabs}>
              {[['template', 'Template'], ['sponsor', 'Sponsors'], ['text', 'Text']].map(([id, label]) => (
                <button key={id} type="button" role="tab" id={`dt-${id}`} aria-selected={tab === id} aria-controls="dt-panel"
                  onClick={() => setTab(id)} className={m.tab}>
                  {label}
                  {id === 'sponsor' && draftLogos.length > 0 && <span className={m.tabCount}>{draftLogos.length}</span>}
                </button>
              ))}
            </div>
            <div role="tabpanel" id="dt-panel" aria-labelledby={`dt-${tab}`} className={m.panelBody}>
              {tab === 'template' && (
            <div role="radiogroup" aria-label="Design template" className={m.tplGrid} ref={tplRef}>
              {ordered.map((t) => {
                const isOwned = ownedHit(t.id, draftTheme);
                return (
                <button key={t.id} type="button" role="radio" aria-checked={draft === t.id}
                  disabled={isOwned} aria-disabled={isOwned}
                  onClick={() => { autoPick.current = false; setDraft(t.id); }} aria-label={`${t.name}: ${t.desc}${isOwned ? ' (owned)' : ''}`}
                  title={isOwned ? 'You already own this design' : undefined}
                  className={`${m.thumb} ${m.tplCard}`}
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
                  <span className={m.thumbBox}>
                  <span style={{ display: 'block', width: thumbW }}>
                    <SponsorPhoto photo={photo} variant={t.id} ratio={thumbRatio}
                      theme={draftTheme}
                      sponsors={sponsors} positions={draftPositions}
                      event={previewMeta.event} className={draftClass}
                      result={draftResult} subject={previewMeta.subject} />
                  </span>
                  </span>
                  <div className={m.thumbName}>
                    <strong>{t.short}</strong>
                    {BEST_FIT.includes(t.id) && !isOwned && <small>Best fit</small>}
                  </div>
                  </button>
                  );
                })}
            </div>
              )}
              {tab === 'sponsor' && (
                <>
              <div role="tablist" aria-label="Sponsor sources" style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {[['event', `Event sponsors${eventLogos.length ? ` (${eventLogos.length})` : ''}`], ['mine', `My sponsors${myLogos.length ? ` (${myLogos.length})` : ''}`]].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={spTab === id} onClick={() => setSpTab(id)}
                    className={m.pick} style={{ padding: '6px 10px' }}>
                    {label}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Pick sponsor logos" style={{ display: 'grid', gap: 8 }}>
                {tabLogos.length === 0 && !mineLocked && (
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
                        {l.label}{l.mine ? ' · yours' : ''}
                        {!l.mine && dc ? <small className={m.chipDeal}>−{nzd(dc)} on this photo</small> : null}
                      </span>
                      <span className={m.chipState} aria-hidden="true">{on ? '✓ Added' : '+ Add'}</span>
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
                mineLocked ? (
                  <div className="auth-card" style={{ marginTop: 8 }}>
                    <p className="eyebrow">Members only</p>
                    <p>Sign in to save your own sponsors — they stay on your account, invisible to other buyers.</p>
                    <p className="btn-row">
                      <Link href={`/login?next=${encodeURIComponent(pathname || '/')}`} className="btn-light">Sign in</Link>
                    </p>
                  </div>
                ) :
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
            {draft === 'logo-plate' && picked.length > 0 && (
              <div>
                <p className={m.step}>Logo corners <em className={m.stepNote}>tap a corner</em></p>
                <div role="group" aria-label="Logo positions" className={m.cornerList}>
                  {(picked.length > PLATE_MAX_CORNERS ? picked.slice(0, 1) : picked).map((l) => (
                    <div key={l.id || 'default'} className={m.cornerRow}>
                      <span className={m.cornerLabel}>{picked.length > PLATE_MAX_CORNERS ? 'All logos' : l.label}</span>
                      <div role="radiogroup" aria-label={`${l.label || 'Logo'} corner`} className={m.corners}>
                        {[['Top left', 'top-left'], ['Top right', 'top-right'], ['Bottom left', 'bottom-left'], ['Bottom right', 'bottom-right']].map(([label, pos]) => (
                          <button key={pos} type="button" role="radio" aria-checked={(draftPos[l.id] || defaultPos(l.id)) === pos}
                            aria-label={label} title={label} onClick={() => setDraftPosFor(l.id, pos)}
                            className={`${m.corner} ${m['c-' + pos]}`}><i aria-hidden="true" /></button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
                </>
              )}
              {tab === 'text' && (
                <div>
                  <p className={m.panelNote}>Shown on every template. Leave blank to use the photo&apos;s own class and moment.</p>
                  <TagEditor value={draftTags} onChange={setDraftTags}
                    hint={{ class: meta?.className || '', result: momentText(previewMeta.result, previewMeta.moment) }} />
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className={`st-modal-foot ${m.foot}`}>
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
