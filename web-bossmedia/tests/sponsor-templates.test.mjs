import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsx = readFileSync(join(root, 'components', 'SponsorTemplates.jsx'), 'utf8');
const css = readFileSync(join(root, 'components', 'SponsorTemplates.module.css'), 'utf8');
const page = readFileSync(join(root, 'app', 'sponsor', 'templates', 'page.jsx'), 'utf8');

test('14 picker templates, 19 retired ones still render for owned designs', () => {
  const ids = [...jsx.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.equal(ids.length, 33, `want 33 variants, got ${ids.length}`);
  assert.equal(new Set(ids).size, 33, 'variant ids unique');
  const picker = jsx.slice(jsx.indexOf('export const TEMPLATE_VARIANTS'), jsx.indexOf('export const LEGACY_VARIANTS'));
  assert.deepEqual([...picker.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]),
    ['broadcast', 'keyline', 'result-card', 'rosette', 'angle',
      'fade-footer', 'sponsor-bar', 'mat-frame', 'poster-panel', 'logo-plate',
      'header-bar', 'side-column', 'ribbon-tag', 'split-footer']);
  assert.ok(jsx.includes('THEMED_VARIANTS = [...TEMPLATE_VARIANTS.map'), 'every picker template has light + dark');
  const modal = readFileSync(join(root, 'components', 'LogoModal.jsx'), 'utf8');
  assert.ok(modal.includes('aria-label="Style"'), 'light/dark switch sits with the template rail');
  assert.ok(modal.includes('className={m.tplGrid}'), 'templates get their own tab, first');
  assert.ok(modal.includes('className={m.corners}'), 'logo corners picked on a 2x2 map, not a row of words');
  for (const old of ['banner-wave', 'corner-badge', 'winner-banner', 'winner-minimal', 'class-spotlight']) {
    assert.ok(ids.includes(old), `retired ${old} must keep rendering bought files`);
  }
  assert.ok(jsx.includes('export const isPickerVariant'), 'picker hides retired templates');
  const bake = readFileSync(join(root, '..', 'api', 'src', 'lib', 'logoBake.js'), 'utf8');
  for (const id of ids) assert.ok(bake.includes(`'${id}'`), `bake knows ${id}`);
});

test('short-edge templates size by the photo short side in preview and bake', () => {
  assert.ok(css.includes('--s: calc(var(--k, 1) * 1cqw)'), 'preview defines the short-edge unit');
  assert.ok(jsx.includes("'--k': shortK"), 'frame passes its short-edge factor');
  const bake = readFileSync(join(root, '..', 'api', 'src', 'lib', 'logoBake.js'), 'utf8');
  assert.ok(bake.includes('Math.min(W, H) / 100'), 'bake uses the same short-edge unit');
  const row = (src) => src.slice(src.indexOf('function kitRow'), src.indexOf('function kitRow') + 220)
    .match(/\{ h: [\d.]+, w: \d+ \}/g);
  assert.equal(row(jsx)?.length, 4, 'kitRow has 4 size steps');
  assert.deepEqual(row(jsx), row(bake), 'logo sizes per count match between preview and bake');
  assert.ok(!jsx.includes('YOUR LOGO</strong>'), 'no fake brand placeholder');
});

test('every st-* class used in JSX exists in the CSS module', () => {
  const used = new Set([...jsx.matchAll(/s\["(st-[a-z-]+)"\]/g)].map((m) => m[1]));
  assert.ok(used.size > 20, 'component should use many module classes');
  for (const c of used) {
    assert.ok(css.includes(`.${c}`), `CSS module missing .${c}`);
  }
});

test('every variant has a short carousel label', () => {
  const shorts = [...jsx.matchAll(/short: '([^']+)'/g)].map((m) => m[1]);
  const ids = [...jsx.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.equal(shorts.length, ids.length, 'one short label per variant');
  assert.ok(new Set(shorts).size === shorts.length, 'short labels unique');
});

test('save/load design helpers round-trip per photo', () => {
  assert.ok(jsx.includes('export function saveDesign'), 'saveDesign exported');
  assert.ok(jsx.includes('export function loadDesign'), 'loadDesign exported');
  assert.ok(jsx.includes('bossmedia:sponsor-design:'), 'key namespaced per photo');
});

test('demo page renders all variants through SponsorPhoto', () => {
  assert.ok(page.includes('TEMPLATE_VARIANTS'), 'page maps over TEMPLATE_VARIANTS');
  assert.ok(page.includes('<SponsorPhoto'), 'page renders SponsorPhoto');
});

test('every variant maps to a backend template id the server accepts', () => {
  const map = Object.fromEntries(
    [...jsx.matchAll(/'([a-z-]+)': '(corner|banner|top|minimal|winner|bottombar)'/g)]
      .map((m) => [m[1], m[2]]));
  const ids = [...jsx.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  for (const id of ids) {
    assert.ok(map[id], `variant ${id} has no backend mapping`);
  }
  // Server allowlist (api migrasi 091) — jangan kirim id lain.
  const modal = readFileSync(join(root, 'components', 'LogoModal.jsx'), 'utf8');
  const purchase = readFileSync(join(root, 'components', 'MediaPurchase.jsx'), 'utf8');
  assert.ok(!modal.includes('TemplatePreview'), 'canvas preview removed');
  assert.ok(modal.includes('SponsorPhoto'), 'modal previews with SponsorPhoto');
  assert.ok(!modal.includes('setStep'), 'modal is one screen (no step state)');
  assert.ok(modal.includes('zIndex: 200'), 'modal sits above sticky header');
  assert.ok(modal.includes('Save design'), 'modal has a Save button');
  assert.ok(!modal.includes('scrollBy'), 'vertical template list needs no scroll arrow');
  assert.ok(!modal.includes('logos.slice(0, 1)'), 'nothing picked shows the neutral placeholder, never the first logo');
  assert.ok(modal.includes('picked.length > 0 && ('), 'position controls only exist for picked logos');
  assert.ok(purchase.includes('Remove design'), 'whole design removable from the panel');
  assert.ok(modal.includes('Remove design'), 'whole design removable from inside the modal');
  assert.ok(jsx.includes('export function clearDesign'), 'saved draft deletable per photo');
  assert.ok(modal.includes('mediaId'), 'modal saves per photo');
  assert.ok(modal.includes('createPortal'), 'modal portals above navbar stacking');
  assert.ok(modal.includes('flexDirection'), 'modal is a no-scroll flex column');
  assert.ok(modal.includes('Logo positions'), 'modal positions each picked logo');
  assert.ok(modal.includes(`'Top left', 'top-left'`), 'position picker offers all four corners');
  assert.ok(!modal.includes('compact'), 'thumbnails render full text like the main preview — no compact hiding');
  assert.ok(!modal.includes("width: 'auto', maxWidth: '100%'"), 'height-clamped frame that broke ratio is gone');
  // Strip/wave % tinggi frame = ramping seperti referensi, proporsional di semua orientasi.
  for (const cls of ['st-strip-bottom', 'st-strip-top', 'st-strip-dual', 'st-strip-square']) {
    assert.ok(css.includes(`.${cls} `) && css.includes('min-height: 12%'), `${cls} slim + height-relative (12%)`);
  }
  assert.ok(css.includes('.st-wave ') && css.includes('height: 6%'), 'wave thin accent (6%)');
  assert.ok(purchase.includes('<SponsorPhoto'), 'main photo previews chosen design (reverts when unpicked)');
  assert.ok(modal.includes('onAspect'), 'photo aspect shared with thumbnails');
  assert.ok(modal.includes('thumbRatio'), 'thumbnails follow photo ratio');
  assert.ok(!modal.includes('template-card'), 'thumbs styled inline (global .template-card span would beat cqw)');
  assert.ok(!jsx.includes('dualLogos'), 'dual helper removed with dual-bar');
  assert.ok(jsx.includes('st-wpanel-top') && jsx.includes('st-wside-mid'), 'winner panels distributed (no empty bottom)');
  assert.ok(css.includes('.st-wbar-win .st-class') && css.includes('color: #fff'), 'winner-bottom class readable on navy');
  assert.ok(css.includes('.st-wpanel .st-class, .st-wside .st-class'), 'panel class stacks tag above text');
  assert.ok(purchase.includes('loadDesign(media.id)'), 'checkout restores saved design');
  assert.ok(purchase.includes('mediaId={media.id}'), 'checkout passes media id to modal');
  assert.ok(purchase.includes('MAX_SPONSOR_LOGOS'), 'cap (8) comes from the shared helper');
  assert.ok(modal.includes('setDraft'), 'modal browses in draft (page untouched until Save)');
  assert.ok(purchase.includes('appliedLive'), 'main photo shows saved design only');
  assert.ok(!purchase.includes('selectAndOpen'), 'page has no picker — single modal entry point');
  assert.ok(!purchase.includes('Remove {l.label} logo'), 'no per-logo remove on page — all inside modal');
  assert.ok(purchase.includes('Edit design (${pickedLogos.length})'), 'panel is a read-only summary + one button');
  assert.ok(jsx.includes('THEMED_VARIANTS'), 'strip variants declare theme support');
  assert.ok(css.includes('.st-strip.st-dark'), 'dark strip style exists');
  assert.ok(modal.includes('aria-label="Style"'), 'modal has Light/Dark toggle');
  assert.ok(modal.includes('draftPositions'), 'thumbnails reflect draft position');
  assert.ok(purchase.includes('templateVisible'), 'saved design always shows once picked');
  assert.ok(!modal.includes("t.group === 'Winner' || templateOf(t.id)"), 'no winner filtering — all 19 templates listed');
  assert.ok(!modal.includes('needsClass && !hasClass'), 'no class gating — all 19 templates listed');
  assert.ok(purchase.includes('sponsor_logo_theme'), 'checkout sends the strip theme');
  for (const f of ['components/MediaPurchase.jsx', 'components/CartClient.jsx']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.ok(src.includes('templateOf('), `${f} maps variant to backend id`);
    assert.ok(src.includes('sponsor_logo_variant'), `${f} sends the exact variant id`);
  }
});

test('multi-sponsor: up to 8 logos from picker to preview to bake', () => {
  const purchase = readFileSync(join(root, 'components', 'MediaPurchase.jsx'), 'utf8');
  const modal = readFileSync(join(root, 'components', 'LogoModal.jsx'), 'utf8');
  // Picker lives in the modal and caps at the backend limit via the helper.
  assert.ok(modal.includes("toggleLogoIds(draftLogos, id)"), 'modal toggle goes through the capped helper');
  assert.ok(modal.includes('Pick at least one sponsor logo'), 'empty design cannot be saved');
  assert.ok(purchase.includes('pickedLogos'), 'panel summarizes the picked set');
  assert.ok(purchase.includes('.slice(0, MAX_SPONSOR_LOGOS)'), 'restored drafts keep up to 8');
  assert.ok(jsx.includes('.slice(0, MAX_SPONSOR_LOGOS)'), 'saved designs keep up to 8');
  // Preview: one row that shrinks by count, overlays at own positions.
  assert.ok(jsx.includes('LogoRow'), 'strip lockups share one multi-logo row');
  assert.ok(css.includes('.st-logos.multi '), 'row shrinks for 2 logos');
  assert.ok(css.includes('.st-logos.multi3 '), 'row shrinks further for 3–4');
  assert.ok(css.includes('.st-logos.multi5 '), 'row shrinks further for 5–8');
  // Overlay >4 collapses into one row badge instead of overlapping corners.
  assert.ok(jsx.includes('wide'), 'overlay variants have a wide branch past 4 logos');
  assert.ok(css.includes('.st-badge.wide') && css.includes('.st-round.wide'), 'wide badges restyle, not overlap');
  // All four corners exist on both sides of the preview/bake contract.
  for (const pos of ['pos-tl', 'pos-tr', 'pos-bl', 'pos-br']) {
    assert.ok(css.includes(`.${pos}`), `preview positions ${pos}`);
  }
  assert.ok(jsx.includes(`'top-left'`) || jsx.includes(`"top-left"`), 'preview maps the fourth corner');
  assert.ok(css.includes('.st-logos.col'), 'narrow panels stack the row vertically');
  assert.ok(modal.includes('setDraftPosFor'), 'positions tracked per logo');
  assert.ok(modal.includes('draftPositions = draftPos'), 'thumbnails reflect every position');
  // Bake: same layout rules server-side (WYSIWYG with the preview).
  const bake = readFileSync(join(root, '..', 'api', 'src', 'lib', 'logoBake.js'), 'utf8');
  assert.ok(bake.includes('OVERLAY_MULTI'), 'overlay variants paint one badge per logo');
  assert.ok(bake.includes('rowSize'), 'strip row shrinks by count like the preview');
});

test('buyer tag edits apply instantly to their design only, never the canonical row', () => {
  const tag = readFileSync(join(root, 'components', 'TagEditor.jsx'), 'utf8');
  assert.ok(!tag.includes('/corrections'), 'no review queue — direct and instant');
  assert.ok(!tag.includes('Won it'), 'no checkbox — the result text itself gates winners');
  assert.ok(tag.includes('Moment'), 'buyer writes their own moment (Winner, Clear round, 2nd place)');
  assert.ok(tag.includes('MOMENT_PRESETS'), 'one-tap moment chips');
  assert.ok(!tag.includes('Horse'), 'horse/rider locked — class + win + result only');
  assert.ok(!tag.includes('fetch('), 'editor only reports upward; parent persists the draft');
  const modal = readFileSync(join(root, 'components', 'LogoModal.jsx'), 'utf8');
  assert.ok(modal.includes('<TagEditor'), 'tags picked inside the modal with the sponsors');
  assert.ok(modal.includes('My sponsors'), 'sponsor tabs: event vs mine');
  assert.ok(modal.includes('Brand name'), 'buyer uploads their own logo in the My tab');
  assert.ok(modal.includes('Add new sponsor'), 'upload form hides behind one button — list first');
  assert.ok(modal.includes('/api/my/sponsor-logos'), 'upload + picker hit the buyer-scoped endpoints');
  assert.ok(modal.includes('/api/my/sponsor-logos'), 'upload + picker hit the buyer-scoped endpoints');
  assert.ok(modal.includes('momentText(draftTags.result'), 'typed moment wins, photo moment is the fallback');
  assert.ok(!modal.includes('isWinningResult'), 'no winner-only templates: every template shows class + moment');
  const purchase = readFileSync(join(root, 'components', 'MediaPurchase.jsx'), 'utf8');
  assert.ok(!purchase.includes('<TagEditor'), 'panel stays a summary — no editor outside modal');
  assert.ok(!purchase.includes('<TagSuggest'), 'suggestion flow removed');
  assert.ok(purchase.includes('design_tags: designTags'), 'overrides ride the money paths (unlock + buy + cart)');
  assert.ok(purchase.includes('result: tagResult'), 'class + result text flow to checkout');
  assert.ok(modal.includes('result={draftResult}'), 'modal preview follows the draft result live');
  assert.ok(!modal.includes('className={previewMeta.className}'), 'thumbnails render draft class too — never the stale saved one');
  const mod = readFileSync(join(root, 'components', 'LogoModal.module.css'), 'utf8');
  assert.ok(mod.includes('.pick:hover'), 'one hover language for chips, tabs and radios');
  assert.ok(mod.includes('.thumb:hover'), 'carousel thumbnails respond to hover');
  assert.ok(mod.includes('.outlineBtn:hover'), 'upload + ghost buttons respond to hover');
  assert.ok(mod.includes('.card .st-btn:hover'), 'white Save responds to hover');
  assert.ok(mod.includes('#e3b341'), 'focus ring uses the site accent, not the light-surface halo');
  assert.ok(mod.includes('.fileGhost'), 'real input overlaid invisible — clicks land on it directly');
  assert.ok(!modal.includes('upFileRef'), 'no ref.click() forwarding anywhere');
  assert.ok(!mod.includes('file-selector-button'), 'no native-button styling to fight the OS');
  assert.ok(!modal.includes('upFileRef'), 'no programmatic click anywhere in the upload path');
  assert.ok(!mod.includes('.fileHidden'), 'hidden-input pattern fully removed');
  assert.ok(mod.includes('.currentPill'), 'picked template carries an unmistakable Current mark');
  assert.ok(modal.includes('m.tplCard'), 'equal-size template cards');
  assert.ok(!modal.includes('Sponsor overlay'), 'carousel sublabels drop the repeated group words');
  assert.ok(modal.includes('min(100cqw, calc(100cqh *'), 'preview frame is contain-fit in CSS, never squished or cropped');
  assert.ok(!modal.includes('ResizeObserver'), 'no measured sizes that can go stale');
  assert.ok(readFileSync(join(root, 'components', 'LogoModal.module.css'), 'utf8').includes('container-type: size'), 'preview cell is a size container');
  assert.ok(modal.includes("width: 'min(1400px, 96vw)'"), 'modal goes wide — preview gets the room');
  assert.ok(modal.includes('aria-label="Design steps"'), 'one option tab at a time: Template, Sponsors, Text');
  assert.ok(modal.includes("setTab(startLogos.length ? 'template' : 'sponsor')"), 'opens on Sponsors when Save would be blocked');
  assert.ok(modal.includes("onClick={() => setTab('sponsor')}"), 'empty preview hint jumps to the sponsor tab');
  assert.ok(readFileSync(join(root, 'components', 'LogoModal.module.css'), 'utf8').includes('grid-template-columns: minmax(0, 1fr) 380px'), 'desktop: preview takes all space but one 380px panel');
  assert.ok(modal.includes('menempel di atas') || modal.includes('draftLogos.includes(b.id)'), 'picked logos pin to the top of long lists');
  assert.ok(!modal.includes('Bakes as '), 'no backend ids in buyer-facing carousel copy');
  assert.ok(!modal.includes('#1d7a34'), 'owned badge back on palette (no off-system green)');
  const tagCss = readFileSync(join(root, 'components', 'TagEditor.module.css'), 'utf8');
  assert.ok(tagCss.includes('.input:hover'), 'tag inputs respond to hover');
  assert.ok(purchase.includes(':tags:${designTagsSig(designTags)}'), 'cart key separates tag variants');
  assert.ok(purchase.includes("v.design_class || '') === (designTags?.class_name || '')"), 'owned guard compares tags');
  const lib = readFileSync(join(root, 'lib', 'sponsor-logos.mjs'), 'utf8');
  assert.ok(lib.includes('designTagsSig'), 'shared tag fingerprint helper');
  for (const f of ['components/MediaPurchase.jsx', 'components/CartClient.jsx']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.ok(src.includes('design_tags'), `${f} forwards buyer tag overrides`);
  }
  const route = readFileSync(join(root, '..', 'api', 'src', 'routes', 'media.js'), 'utf8');
  assert.ok(route.includes('resolveDesignTags'), 'backend validates tag shape');
  assert.ok(route.includes('result: clean(raw.result, 40)'), 'result text validated + capped');
  assert.ok(route.includes('/api/my/sponsor-logos'), 'buyer upload + list endpoints exist');
  assert.ok(route.includes("app.delete('/api/my/sponsor-logos/:id'"), 'buyer removes their own logo');
  assert.ok(route.includes('sponsors.user_id'), 'remove + checkout both scope personal rows to the uploader');
  assert.ok(modal.includes('onOwnRemoved'), 'picker drops the row after remove');
  assert.ok(modal.includes('Remove ${l.label} logo'), 'per-logo remove in the My tab');
  assert.ok(route.includes('logo not available to you'), 'personal logos are owner-only at checkout');
  assert.ok(route.includes('sponsors.user_id'), 'personal sponsor rows key off the buyer');
  assert.ok(route.includes('design_class, design_subject, design_result'), 'tags persist on the purchase, not the media row');
  assert.ok(route.includes("designTags?.class_name || ''"), 'version fingerprint covers tags');
  const mig97 = readFileSync(join(root, '..', 'db', 'migrations', '097_design_result.sql'), 'utf8');
  assert.ok(mig97.includes('design_result'), 'migration 097 adds the result columns');
  assert.ok(mig97.includes('purchases_paid_media_version'), 'version index rebuilt with result');
  const bake = readFileSync(join(root, '..', 'api', 'src', 'lib', 'logoBake.js'), 'utf8');
  assert.ok(bake.includes("b.result || 'WINNER'"), 'winner laurels render the buyer result, WINNER by default');
  assert.ok(bake.includes('result: resultText'), 'bake threads the override into every layout');
});

test('exact variant id flows end to end (migration + checkout + download)', () => {
  const apiRoot = join(root, '..', 'api');
  const sql = readFileSync(join(root, '..', 'db', 'migrations', '093_logo_variant.sql'), 'utf8');
  assert.ok(sql.includes('logo_variant'), 'migration 093 adds purchases.logo_variant');
  const route = readFileSync(join(apiRoot, 'src', 'routes', 'media.js'), 'utf8');
  for (const needle of ['sponsor_logo_variant', 'logoVariant', 'logo_variant', 'bakeVariant', 'exactVariant']) {
    assert.ok(route.includes(needle), `media.js references ${needle}`);
  }
  const bake = readFileSync(join(apiRoot, 'src', 'lib', 'logoBake.js'), 'utf8');
  const ids = [...jsx.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  for (const id of ids) {
    assert.ok(bake.includes(`'${id}'`), `logoBake implements ${id}`);
  }
});

test('per-version ownership: buy page shows owned versions, still sells the rest', () => {
  const purchase = readFileSync(join(root, 'components', 'MediaPurchase.jsx'), 'utf8');
  assert.ok(purchase.includes('owned_versions'), 'buy page reads owned_versions');
  assert.ok(purchase.includes('ownsPlain'), 'plain ownership tracked separately');
  assert.ok(purchase.includes('draftOwnedVersion'), 'identical draft design warns upfront');
  assert.ok(purchase.includes('download?purchase='), 'per-version downloads pin the purchase');
  assert.ok(!purchase.includes('appliedLive ? (') || purchase.includes('appliedLive && !versions.length'),
    'saved draft never masquerades as owned');
  const apiRoot = join(root, '..', 'api');
  const route = readFileSync(join(apiRoot, 'src', 'routes', 'media.js'), 'utf8');
  assert.ok(route.includes('sameVersionOwned'), 'checkout guards the identical version only');
  assert.ok(route.includes('logo_sig'), 'version fingerprint stored for the uniqueness index');
  assert.ok(route.includes('purchases_paid_media_version'), 'uniqueness is per version, not per photo');
  const mig = readFileSync(join(root, '..', 'db', 'migrations', '094_logo_version_sig.sql'), 'utf8');
  assert.ok(mig.includes('purchases_paid_media_version'), 'migration 094 replaces the per-photo index');
  assert.ok(purchase.includes(':${logoTemplate}`'), 'cart key separates designs of the same photo');
  assert.ok(purchase.includes('draftClearedFor'), 'restored draft matching an owned version is dropped silently');
  const modal = readFileSync(join(root, 'components', 'LogoModal.jsx'), 'utf8');
  assert.ok(modal.includes('ownedDesigns'), 'modal receives owned designs');
  assert.ok(modal.includes('✓ Owned'), 'owned templates carry a clear badge');
  assert.ok(modal.includes('disabled={isOwned}'), 'owned templates cannot be picked');
  assert.ok(modal.includes('o.variant && o.variant === variantId'), 'owned = exact variant only (legacy never blocks)');
});

test('T-series typography + kit are one copy in preview and bake', () => {
  const bake = readFileSync(join(root, '..', 'api', 'src', 'lib', 'logoBake.js'), 'utf8');
  const blk = (src) => {
    const i = src.indexOf('// — T-series templates');
    const j = src.indexOf('\n}\n', src.indexOf('function kitLayoutT')) + 3;
    return src.slice(i, j).replaceAll('export ', '');
  };
  assert.ok(blk(jsx).length > 2000, 'T-series kit block found');
  assert.equal(blk(jsx), blk(bake), 'TYPE, colours, rosette art and kitLayoutT match the bake');
  for (const f of ['BarlowCondensed-SemiBold.ttf', 'BarlowCondensed-ExtraBold.ttf', 'BarlowCondensed-ExtraBoldItalic.ttf', 'DMSerifDisplay-Regular.ttf']) {
    const a = readFileSync(join(root, 'components', 'sponsor-fonts', f));
    const b = readFileSync(join(root, '..', 'api', 'src', 'lib', 'fonts', f));
    assert.ok(a.equals(b), `${f} identical for preview and bake`);
  }
  assert.ok(jsx.includes("next/font/local"), 'preview loads the same TTFs');
});

test('rosette colour follows the placing in the moment text', () => {
  const src = jsx.slice(jsx.indexOf('const PLACE_WORDS'), jsx.indexOf('export const PLACE_LABEL'));
  const placingOf = new Function(src.replace('export function placingOf', 'function placingOf') + '; return placingOf;')();
  assert.equal(placingOf('Winner'), 1);
  assert.equal(placingOf('2nd place'), 2);
  assert.equal(placingOf('Reserve champion'), 2);
  assert.equal(placingOf('Third'), 3);
  assert.equal(placingOf('Clear round'), 0);
  assert.equal(placingOf(''), 0);
});

test('photo page quick picks: best three styles, one tap applies, Customize opens the editor', () => {
  const quick = readFileSync(join(root, 'components', 'QuickStyles.jsx'), 'utf8');
  const purchase = readFileSync(join(root, 'components', 'MediaPurchase.jsx'), 'utf8');
  const modal = readFileSync(join(root, 'components', 'LogoModal.jsx'), 'utf8');
  assert.ok(jsx.includes('export const RECOMMENDED_BY_ASPECT'), 'one ranking for modal and page');
  assert.ok(modal.includes('RECOMMENDED_BY_ASPECT[aspectKey]'), 'modal uses the shared ranking');
  assert.ok(quick.includes('.slice(0, 3)'), 'three quick styles');
  assert.ok(quick.includes('filter((id) => !owned(id))'), 'owned designs are not offered again');
  assert.ok(purchase.includes('<QuickStyles'), 'quick picks sit in the sponsor design panel');
  assert.ok(purchase.includes('saveDesign(media.id, { template: variant'), 'a quick pick is saved like a modal Save');
  assert.ok(purchase.includes('onCustomize={() => setLogoOpen(true)}'), 'Customize opens the full editor');
  assert.ok(purchase.includes('discountFor(l.id)?.discount_cents'), 'discount only from server-funded budgets');
  assert.ok(purchase.includes('{pickedLogos.length} sponsors'), 'several sponsors: one row with the single best discount, never per-logo amounts that look additive');
});
