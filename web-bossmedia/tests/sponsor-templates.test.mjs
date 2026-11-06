import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsx = readFileSync(join(root, 'components', 'SponsorTemplates.jsx'), 'utf8');
const css = readFileSync(join(root, 'components', 'SponsorTemplates.module.css'), 'utf8');
const page = readFileSync(join(root, 'app', 'sponsor', 'templates', 'page.jsx'), 'utf8');

test('19 template variants across Sponsor + Winner groups', () => {
  const ids = [...jsx.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.equal(ids.length, 19, `want 19 variants, got ${ids.length}`);
  assert.equal(new Set(ids).size, 19, 'variant ids unique');
  assert.ok(!ids.includes('dual-bar'), 'dual-bar removed (single sponsor only)');
  for (const must of ['banner-wave', 'portrait-swoosh', 'square-bar', 'left-panel',
    'top-banner', 'corner-badge', 'portrait-drape', 'round-badge', 'gold-frame',
    'minimal-corner', 'class-spotlight',
    'winner-banner', 'winner-arch', 'winner-portrait', 'winner-side', 'winner-top',
    'winner-bottom', 'winner-corner', 'winner-minimal']) {
    assert.ok(ids.includes(must), `missing variant ${must}`);
  }
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
  assert.ok(modal.includes('scrollBy'), 'carousel has a scroll arrow');
  assert.ok(modal.includes('mediaId'), 'modal saves per photo');
  assert.ok(modal.includes('createPortal'), 'modal portals above navbar stacking');
  assert.ok(modal.includes('flexDirection'), 'modal is a no-scroll flex column');
  assert.ok(!modal.includes('Logos'), 'no logo section in modal (single logo)');
  assert.ok(modal.includes('compact'), 'thumbnails render compact');
  assert.ok(modal.includes("width: 'auto'"), 'preview keeps natural ratio (fit, never cropped)');
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
  assert.ok(!purchase.includes('max 3'), 'single logo copy everywhere');
  assert.ok(modal.includes('setDraft'), 'modal browses in draft (page untouched until Save)');
  assert.ok(purchase.includes('appliedLive'), 'main photo shows saved design only');
  assert.ok(purchase.includes('selectAndOpen'), 'logo click selects + opens modal in one');
  assert.ok(purchase.includes('Remove logo'), 'deselect via Remove (photo + discount revert)');
  assert.ok(!purchase.includes('Design & preview ('), 'no separate design button in license panel');
  assert.ok(jsx.includes('THEMED_VARIANTS'), 'strip variants declare theme support');
  assert.ok(css.includes('.st-strip.st-dark'), 'dark strip style exists');
  assert.ok(modal.includes('Strip theme'), 'modal has Light/Dark toggle');
  assert.ok(modal.includes('draftPositions'), 'thumbnails reflect draft position');
  assert.ok(purchase.includes('templateVisible'), 'saved design gated by moment/class filters');
  assert.ok(purchase.includes('sponsor_logo_theme'), 'checkout sends the strip theme');
  for (const f of ['components/MediaPurchase.jsx', 'components/CartClient.jsx']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.ok(src.includes('templateOf('), `${f} maps variant to backend id`);
    assert.ok(src.includes('sponsor_logo_variant'), `${f} sends the exact variant id`);
  }
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
