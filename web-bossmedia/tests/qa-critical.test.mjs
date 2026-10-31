import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const cartSrc = () => src('components/CartClient.jsx');
const loginSrc = () => src('components/LoginClient.jsx');
const registerSrc = () => src('components/RegisterClient.jsx');

// Format logic mirrors lib/figma-data.js `nzd` (no import: JSX modules
// can't be required by plain node).
const nzd = (cents) =>
  `NZ$${(Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, '')}`;
// Mirrors the email gate used by CartClient/LoginClient/RegisterClient.
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
// Mirrors safeNext() in LoginClient/RegisterClient.
const safeNext = (v, fallback = '/media') =>
  v && v.startsWith('/') && !v.startsWith('//') && v !== '/login' && v !== '/register'
    ? v
    : fallback;
// Mirrors POST /api/checkout/combined count guard in api/src/routes/media.js.
const combinedCountOk = (items, reels) => {
  const count = items.length + reels.length;
  return count >= 1 && count <= 20;
};

describe('cart reel-only', () => {
  const reelOnly = [
    {
      key: 'reel:p1:ev1:abc123',
      kind: 'reel',
      image: null,
      type: 'Pre-book coverage',
      name: 'Highlight Reel',
      detail: 'Canterbury Show · Amelia / Apollo',
      priceCents: 9900,
      reelPayload: { product_id: 'p1', horse_name: 'Apollo', music_mode: 'choose_for_me' },
    },
  ];
  const mixed = [
    ...reelOnly,
    { key: 'media:m1:t1', kind: 'media', priceCents: 2500, mediaId: 'm1', tierId: 't1' },
  ];
  const split = (items) => ({
    photoItems: items.filter((it) => it.kind !== 'reel' && it.mediaId),
    reelItems: items.filter((it) => it.kind === 'reel'),
  });

  it('splits photo vs reel items so a reel-only cart has zero photo items', () => {
    const { photoItems, reelItems } = split(reelOnly);
    assert.equal(photoItems.length, 0);
    assert.equal(reelItems.length, 1);
  });

  it('payAll payload for reel-only cart sends items:[] + reels:[payload]', () => {
    const { photoItems, reelItems } = split(reelOnly);
    const body = {
      items: photoItems.map((it) => ({ media_id: it.mediaId, license_tier: it.tierId })),
      reels: reelItems.map((it) => it.reelPayload),
    };
    assert.deepEqual(body.items, []);
    assert.deepEqual(body.reels, [{ product_id: 'p1', horse_name: 'Apollo', music_mode: 'choose_for_me' }]);
    assert.ok(combinedCountOk(body.items, body.reels), 'backend count guard must accept 1 reel-only item');
  });

  it('mixed cart keeps photos and reels in their own lanes', () => {
    const { photoItems, reelItems } = split(mixed);
    assert.equal(photoItems.length, 1);
    assert.equal(reelItems.length, 1);
    assert.equal(reelItems[0].reelPayload.product_id, 'p1');
  });

  it('subtotal covers reels; photoTotal stays 0 for reel-only (wallet math)', () => {
    const subtotal = reelOnly.reduce((t, it) => t + Number(it.priceCents || 0), 0);
    const photoTotal = split(reelOnly).photoItems.reduce((t, it) => t + Number(it.priceCents || 0), 0);
    assert.equal(subtotal, 9900);
    assert.equal(photoTotal, 0);
    // Guest (no login) never applies balance: mirrors `meEmail ? min(balance, subtotal) : 0`.
    assert.equal(null ? Math.min(5000, subtotal) : 0, 0);
    assert.equal(nzd(subtotal), 'NZ$99');
  });

  it('source keeps the reel-only payAll wiring intact', () => {
    const s = cartSrc();
    assert.match(s, /kind !== 'reel'.*mediaId/);
    assert.match(s, /kind === 'reel'/);
    assert.match(s, /reels: reelItems\.map\(\(it\) => it\.reelPayload\)/);
    assert.match(s, /items: photoItems\.map\(/);
    assert.match(s, /if \(!items\.length \|\| busyKey\) return/);
    assert.match(s, /use_balance_cents.*meEmail \? Math\.min\(balance, (subtotal|photoTotal)\) : 0/);
  });

  it('buyReel only drops the item after res.ok (no silent cart loss)', () => {
    const s = cartSrc();
    const fn = s.slice(s.indexOf('async function buyReel'));
    const throwAt = fn.indexOf('if (!res.ok) throw');
    const removeAt = fn.indexOf('removeFromCart(item.key)');
    assert.ok(throwAt !== -1 && removeAt !== -1 && removeAt > throwAt);
  });

  it('empty email blocks payAll/buyMedia/buyReel before any fetch', () => {
    assert.equal(validEmail(''), false);
    assert.equal(validEmail('not-an-email'), false);
    assert.equal(validEmail('rider@example.nz'), true);
    assert.match(cartSrc(), /const checkoutEmail = \(\) =>/);
  });

  it('reel-only cart renders the cover fallback, never a broken image', () => {
    const s = cartSrc();
    assert.match(s, /item\.image \? <SmartImage[\s\S]*? : <span className="cover-fallback"/);
    // PreBook reel items intentionally carry image:null.
    assert.match(src('components/PreBookClient.jsx'), /image: null/);
  });
});

describe('checkout combined contract (backend)', () => {
  const backend = () => readFileSync(join(ROOT, '..', 'api', 'src', 'routes', 'media.js'), 'utf8');

  it('accepts reel-only (0 photos + 1 reel) and rejects empty / oversized carts', () => {
    assert.equal(combinedCountOk([], [{ product_id: 'p1' }]), true);
    assert.equal(combinedCountOk([], []), false);
    assert.equal(combinedCountOk(new Array(21).fill({}), []), false);
    assert.match(backend(), /count < 1 \|\| count > 20/);
  });

  it('requires items[]/reels[] arrays, valid email, sane idempotency key', () => {
    const s = backend();
    assert.match(s, /need \{items\[\], reels\[\]\}/);
    assert.match(s, /need a valid \{email\}/);
    assert.match(s, /\^?\[A-Za-z0-9_-\]\{8,128\}/);
  });

  it('dedupes reel payloads and guests pay card-only (no balance)', () => {
    const s = backend();
    assert.match(s, /duplicate pre-book in cart/);
    assert.match(s, /if \(buyer\.guest\) useBalance = 0/);
  });

  it('frontend never follows a non-Stripe checkout_url (open-redirect guard)', () => {
    const s = src('lib/figma-data.js');
    assert.match(s, /\^https:\\\/\\\/\(checkout\|buy\)\\\.stripe\\\.com\\\//);
    assert.throws(() => {
      const u = 'https://evil.example/checkout';
      if (typeof u !== 'string' || !/^https:\/\/(checkout|buy)\.stripe\.com\//.test(u)) {
        throw new Error('Checkout failed — try again.');
      }
    }, /Checkout failed/);
  });
});

describe('login', () => {
  it('safeNext blocks open redirects and auth-loop targets', () => {
    assert.equal(safeNext('/media'), '/media');
    assert.equal(safeNext('/events/slug'), '/events/slug');
    assert.equal(safeNext('https://evil.example'), '/media');
    assert.equal(safeNext('//evil.example/x'), '/media');
    assert.equal(safeNext('/login'), '/media');
    assert.equal(safeNext('/register'), '/media');
    assert.equal(safeNext(null), '/media');
    assert.match(loginSrc(), /startsWith\('\/'\) && !v\.startsWith\('\/\/'\)/);
  });

  it('validates email + password before hitting /auth/login', () => {
    const s = loginSrc();
    assert.match(s, /Enter your email and password\./);
    assert.match(s, /Enter a valid email address\./);
    assert.match(s, /fetch\(`\$\{API\}\/auth\/login`/);
  });

  it('handles MFA challenge instead of landing half-authed', () => {
    const s = loginSrc();
    assert.match(s, /mfa_required/);
    assert.match(s, /\/auth\/mfa\/challenge/);
    assert.match(s, /Enter the 6-digit code/);
  });

  it('staff without deep link land in /studio, buyers keep `next`', () => {
    const s = loginSrc();
    assert.match(s, /role === 'ADMIN' \|\| role === 'PHOTOGRAPHER'\) \? '\/studio' : next/);
  });
});

describe('register', () => {
  it('validates name, email shape, 8-char password, match, and terms', () => {
    const s = registerSrc();
    assert.match(s, /Tell us your name/);
    assert.match(s, /Enter a valid email address\./);
    assert.match(s, /Password needs at least 8 characters\./);
    assert.match(s, /Passwords do not match/);
    assert.match(s, /Please accept the Terms/);
  });

  it('guest-purchase claim flow shows the inbox state, not a dead end', () => {
    const s = registerSrc();
    assert.match(s, /claim_sent/);
    assert.match(s, /Check your inbox\./);
    assert.match(s, /expires in 1 hour/);
  });

  it('already-logged-in users get a way out, not a stranded form', () => {
    const s = registerSrc();
    assert.match(s, /Already signed in/);
    assert.match(s, /\/auth\/me/);
  });

  it('safeNext fallback keeps post-register landing inside the app', () => {
    assert.equal(safeNext('/media'), '/media');
    assert.equal(safeNext('https://evil.example'), '/media');
    assert.match(registerSrc(), /!v\.startsWith\('\/\/'\)/);
  });
});

describe('regression: error.jsx header/footer + alt text', () => {
  it('app/error.jsx renders inside PageShell (header + footer survive crashes)', () => {
    const s = src('app/error.jsx');
    assert.match(s, /import PageShell from '\.\.\/components\/PageShell'/);
    assert.match(s, /<PageShell/);
    const shell = src('components/PageShell.jsx');
    assert.match(shell, /<SiteHeader \/>/);
    assert.match(shell, /<SiteFooter \/>/);
  });

  it('studio/error.jsx keeps its retry affordance', () => {
    const s = src('app/studio/error.jsx');
    assert.match(s, /onClick=\{\(\) => reset\(\)\}/);
    assert.match(s, /Try again/);
  });

  it('no SmartImage call site renders an empty alt', () => {
    const hits = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) {
          if (e === 'node_modules') continue;
          walk(p);
        } else if (/\.jsx?$/.test(e)) {
          const content = readFileSync(p, 'utf8');
          const uses = [...content.matchAll(/<SmartImage([\s\S]*?)\/>/g)];
          for (const m of uses) {
            const props = m[1];
            const alt = props.match(/alt=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/);
            const rel = p.replace(`${ROOT}/`, '');
            if (!alt) hits.push(`${rel}: SmartImage without alt`);
            else {
              const val = (alt[1] ?? alt[2] ?? alt[3] ?? '').trim();
              if (val === '' || val === "''" || val === '""') hits.push(`${rel}: SmartImage with empty alt`);
            }
          }
        }
      }
    };
    walk(join(ROOT, 'app'));
    walk(join(ROOT, 'components'));
    assert.deepEqual(hits, []);
  });

  it('cart alt falls back to item name/detail, never blank', () => {
    assert.match(cartSrc(), /alt=\{item\.name \|\| item\.detail \|\|/);
  });
});
