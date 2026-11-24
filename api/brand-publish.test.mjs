// Pure unit tests: community moments publish only after branding (no DB).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { brandThenPublish } = require('./src/routes/media.js');

function fakes(brandResult) {
  const calls = { published: [], failed: [] };
  return {
    calls,
    deps: {
      brand: async (m) => brandResult(m),
      publish: async (m) => { calls.published.push(m.id); return { ...m, status: 'published' }; },
      fail: async (m, error) => { calls.failed.push([m.id, error]); },
    },
  };
}

test('branded rows publish, failed or skipped rows stay drafts', async () => {
  const { calls, deps } = fakes((m) => {
    if (m.id === 'throws') throw new Error('ffmpeg exploded');
    return m.id !== 'skipped';
  });
  const out = await brandThenPublish([{ id: 'ok' }, { id: 'throws' }, { id: 'skipped' }], deps);
  assert.deepEqual(out.map((r) => r.id), ['ok']);
  assert.deepEqual(calls.published, ['ok']);
  assert.deepEqual(calls.failed.map(([id]) => id), ['throws', 'skipped']);
  assert.equal(calls.failed[0][1], 'ffmpeg exploded');
  assert.match(calls.failed[1][1], /original or preview missing/);
});

test('a row already decided elsewhere is not reported as published', async () => {
  const { deps } = fakes(() => true);
  deps.publish = async () => null; // UPDATE ... WHERE status = 'draft' matched nothing
  assert.deepEqual(await brandThenPublish([{ id: 'raced' }], deps), []);
});

const { sponsorRepostRefusal } = require('./src/routes/media.js');

test('sponsor repost: community rows only, sponsor or admin accounts only', () => {
  const community = { source: 'web' };
  const studio = { source: 'studio' };
  assert.equal(sponsorRepostRefusal('web', studio, null), null); // other tiers untouched
  assert.equal(sponsorRepostRefusal('sponsor-repost', community, { role: 'SPONSOR' }), null);
  assert.equal(sponsorRepostRefusal('sponsor-repost', community, { role: 'ADMIN' }), null);
  assert.match(sponsorRepostRefusal('sponsor-repost', community, { role: 'PUBLIC' }), /sponsor accounts only/);
  assert.match(sponsorRepostRefusal('sponsor-repost', community, null), /sponsor accounts only/);
  assert.match(sponsorRepostRefusal('sponsor-repost', studio, { role: 'SPONSOR' }), /community moments only/);
});

const { publicTierFilter } = require('./src/routes/media.js');

test('public tier list: sponsor repost only when asked for community', () => {
  assert.equal(publicTierFilter('community'), '');
  for (const q of ['', 'studio', 'photo']) assert.match(publicTierFilter(q), /id <> 'sponsor-repost'/);
});

const { licenseDefaultRefusal } = require('./src/routes/media.js');

test('license default: sponsor repost refused for studio media only', () => {
  assert.match(licenseDefaultRefusal('sponsor-repost', 'studio'), /community moments/);
  assert.match(licenseDefaultRefusal('sponsor-repost', undefined), /community moments/); // unknown row
  assert.equal(licenseDefaultRefusal('sponsor-repost', 'web'), null);
  assert.equal(licenseDefaultRefusal('web', 'studio'), null);
});

const { needsPaidLicence } = require('./src/routes/social.js');

test('social posting: sponsors pay for community moments, everyone else posts free', () => {
  assert.equal(needsPaidLicence(true, 'SPONSOR'), true);
  assert.equal(needsPaidLicence(true, 'PUBLIC'), false);
  assert.equal(needsPaidLicence(true, 'RIDER'), false);
  assert.equal(needsPaidLicence(false, 'PUBLIC'), true); // studio photos always need ownership
});

const { licenceStatus } = require('./src/routes/social.js');

test('licence check: owner-scoped, rejects bad ids before touching the DB', async () => {
  const seen = [];
  const owns = async (uid, mediaId) => { seen.push([uid, mediaId]); return { ok: uid === 'session-user' }; };
  const id = '11111111-2222-3333-4444-555555555555';
  assert.deepEqual(await licenceStatus('session-user', id, owns), { status: 200, body: { data: { owned: true } } });
  assert.deepEqual((await licenceStatus('someone-else', id, owns)).body, { data: { owned: false } });
  assert.equal((await licenceStatus('session-user', 'nope', owns)).status, 400);
  assert.deepEqual(seen, [['session-user', id], ['someone-else', id]]);
});
