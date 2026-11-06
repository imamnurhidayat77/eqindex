// Role invariants for SPONSOR (no DB needed — static source checks).
// Guards: money role gets MFA + short sessions; never self-registerable;
// approval only via admin endpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)));
const src = (p) => readFileSync(join(root, p), 'utf8');

test('migration 085 creates sponsor tables + role check', () => {
  const sql = src('../db/migrations/085_sponsors.sql');
  for (const t of ['CREATE TABLE IF NOT EXISTS sponsors (', 'CREATE TABLE IF NOT EXISTS sponsor_logos (', 'CREATE TABLE IF NOT EXISTS sponsor_budgets (']) {
    assert.ok(sql.includes(t), `missing ${t}`);
  }
  assert.ok(sql.includes("'SPONSOR'"), 'role check must include SPONSOR');
});

test('SPONSOR is an MFA money role with a short session', () => {
  const auth = src('src/routes/auth.js');
  assert.match(auth, /MFA_ROLES = \[[^\]]*'SPONSOR'[^\]]*\]/);
  const session = src('src/middleware/session.js');
  assert.match(session, /IDLE_MS = \{[^}]*SPONSOR: 12 \* 3600e3[^}]*\}/);
});

test('dummy seed covers the sponsor dashboard', () => {
  const seed = src('../db/seeds/003_sponsors.sql');
  for (const t of ['SPONSOR', 'sponsors (', 'sponsor_budgets (']) {
    assert.ok(seed.includes(t), `seed missing ${t}`);
  }
  assert.ok(!seed.includes('INSERT INTO sponsor_logos'), 'seed must not fake logo rows');
});

test('sponsor logo upload endpoint + dummy fixture', () => {
  const user = src('src/routes/user.js');
  assert.ok(user.includes("app.post('/sponsor/logos'"), 'logo upload endpoint exists');
  assert.ok(user.includes("needRole('SPONSOR')"), 'logo upload is sponsor-scoped');
  assert.ok(user.includes('ownSponsor'), 'logo upload uses the ownership guard');
  assert.ok(user.includes('fileTypeFromBuffer'), 'logo MIME is sniffed, not trusted');
  const buf = readFileSync(join(root, 'test-fixtures/sponsor-logo.png'));
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'fixture is a real PNG');
  assert.ok(buf.length <= 2 * 1024 * 1024, 'fixture fits the 2MB cap');
});

test('Option 1 plumbing: purchase logos + bake + picker', () => {
  const mig = src('../db/migrations/086_purchase_logos.sql');
  assert.ok(mig.includes('purchase_sponsor_logos'), 'link table exists');
  assert.ok(mig.includes('logo_variant_key'), 'variant cache column exists');
  const media = src('src/routes/media.js');
  assert.ok(media.includes('sponsor_logo_ids'), 'checkout accepts logo ids');
  assert.ok(media.includes('logo_variant_key'), 'download serves the baked variant');
  assert.ok(media.includes('southwest'), 'composite uses fixed corners');
  const pub = src('src/routes/public.js');
  assert.ok(pub.includes("/api/sponsor-logos"), 'public logo picker exists');
  const user = src('src/routes/user.js');
  assert.ok(user.includes("app.post('/sponsor/logos'"), 'logo upload exists');
});

test('Option 2 plumbing: discount ledger + split + picker', () => {
  const mig = src('../db/migrations/087_sponsor_discounts.sql');
  assert.ok(mig.includes('sponsored_redemptions'), 'ledger table exists');
  assert.ok(mig.includes('original_amount_cents'), 'original price kept');
  assert.ok(mig.includes('discount_cents'), 'budget carries a discount');
  const wallet = src('src/lib/wallet.js');
  assert.ok(wallet.includes('original_amount_cents'), 'split pays photographer on full price');
  assert.ok(wallet.includes('sponsored_redemptions'), 'split writes the ledger');
  const media = src('src/routes/media.js');
  assert.ok(!media.includes('sponsor_budget_id } = req.body'), 'no manual budget param — discount resolves from logos');
  assert.ok(media.includes('ORDER BY b.discount_cents DESC LIMIT 1'), 'best funded budget wins');
  assert.ok(media.includes('sponsor_budgets'), 'checkout reads budgets');
  const pub = src('src/routes/public.js');
  assert.ok(pub.includes('/api/sponsor-discounts'), 'public discount picker exists');
  const seed = src('../db/seeds/003_sponsors.sql');
  assert.ok(seed.includes('discount_cents'), 'dummy budget has a discount');
});

test('Option 3 + gifts plumbing: approvals ledger + gift endpoint', () => {
  const mig = src('../db/migrations/088_sponsor_approvals_gifts.sql');
  assert.ok(mig.includes('logo_approvals'), 'approval ledger exists');
  assert.ok(mig.includes('sponsor_gifts'), 'gift ledger exists');
  const user = src('src/routes/user.js');
  assert.ok(user.includes("app.post('/sponsor/approvals'"), 'sponsor can request approval');
  assert.ok(user.includes("app.post('/sponsor/gifts'"), 'sponsor can gift credits');
  assert.ok(user.includes('ownSponsor'), 'both use the ownership guard');
  const media = src('src/routes/media.js');
  assert.ok(media.includes('approvals/:id/decision'), 'photographer decides');
  assert.ok(media.includes('not your photo'), 'decision is ownership-checked');
});

test('logo templates: buyer-chosen layout end to end', () => {
  const mig = src('../db/migrations/089_logo_templates.sql');
  assert.ok(mig.includes('logo_template'), 'template column exists');
  const media = src('src/routes/media.js');
  assert.ok(media.includes('sponsor_logo_template'), 'checkout accepts a template');
  assert.ok(media.includes('bakeLogoTemplate'), 'download renders the template');
  assert.ok(media.includes('WINNER'), 'winner frame carries event text');
});

test('template v2: top + minimal + Supported by lockup', () => {
  const mig = src('../db/migrations/090_logo_templates_v2.sql');
  assert.ok(mig.includes("'top'") && mig.includes("'minimal'"), 'two new templates allowed');
  const media = src('src/routes/media.js');
  assert.ok(media.includes('Supported by'), 'strips carry the Supported by lockup');
  assert.ok(media.includes("template === 'minimal'"), 'minimal overlay renders');
  assert.ok(media.includes("template === 'banner' || template === 'top'"), 'top mirrors banner');
});

test('SPONSOR is never self-registerable, only admin-approved', () => {
  const auth = src('src/routes/auth.js');
  const m = auth.match(/const wantRole = \[([^\]]*)\]/);
  assert.ok(m, 'register whitelist found');
  assert.ok(!m[1].includes('SPONSOR'), 'register must not grant SPONSOR');
  const admin = src('src/routes/admin.js');
  assert.ok(admin.includes("app.post('/admin/sponsors/approve'"), 'approve endpoint exists');
  assert.ok(admin.includes("SET role = 'SPONSOR'"), 'approve grants SPONSOR role');
  const pub = src('src/routes/public.js');
  assert.ok(pub.includes("'sponsor'"), 'corrections inbox accepts sponsor applications');
});

test('logo theme: light white-wave bake by default, legacy dark strip on demand', () => {
  const mig = src('../db/migrations/092_logo_theme.sql');
  assert.ok(mig.includes('logo_theme'), 'theme column exists');
  assert.ok(mig.includes("'light'") && mig.includes("'dark'"), 'both themes allowed');
  const media = src('src/routes/media.js');
  assert.ok(media.includes('sponsor_logo_theme'), 'checkout accepts a theme');
  assert.ok(media.includes('logo_theme'), 'purchases store the theme');
  assert.ok(media.includes("theme !== 'dark'"), 'light renders the white wave strip');
  assert.ok(media.includes('preserveAspectRatio="none"'), 'wave scales to any photo width');
});
