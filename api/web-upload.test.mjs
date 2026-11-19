// Pure unit tests: QR web-upload contact/code validation (no server, no DB).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { cleanWebContact, webContactError, normalizeUploadCode } = require('./src/routes/inbound.js');
const { buildUploadCodeBase } = require('./src/routes/media.js');

test('contact cleaning normalizes email/phone/names and consent strings', () => {
  const c = cleanWebContact({ email: '  Jess@Example.nz ', phone: '021 123 456', rider_name: ' Jessie ', consent: 'true' });
  assert.equal(c.email, 'jess@example.nz');
  assert.equal(c.phone, '021123456');
  assert.equal(c.rider, 'Jessie');
  assert.equal(c.consent, true);
});

test('contact errors: bad email first, then missing consent', () => {
  assert.match(webContactError(cleanWebContact({ email: 'nope', consent: 'true' })), /valid email/);
  assert.match(webContactError(cleanWebContact({ email: 'a@b.nz', consent: false })), /permission box/);
  assert.equal(webContactError(cleanWebContact({ email: 'a@b.nz', consent: 'true' })), null);
});

test('upload codes are uppercased and must carry a digit', () => {
  assert.equal(normalizeUploadCode('takapo26'), 'TAKAPO26');
  assert.equal(normalizeUploadCode('TAKAPO26 '), 'TAKAPO26');
  assert.equal(normalizeUploadCode('photos'), null); // no digit
  assert.equal(normalizeUploadCode('ABC'), null); // too short
  assert.equal(normalizeUploadCode('a-very-long-token-here'), null);
});

test('code base is built from the event name + year', () => {
  assert.equal(buildUploadCodeBase('Takapoto Classic', '2026-02-14'), 'TAKAP26');
  assert.equal(buildUploadCodeBase('Taupo Show', '2026-01-09'), 'TAUPO26');
  assert.equal(buildUploadCodeBase('', '2026-01-09'), 'SHOW26');
  // pg hands back Date objects for DATE columns — same result.
  assert.equal(buildUploadCodeBase('Takapoto Classic', new Date('2026-02-14T00:00:00Z')), 'TAKAP26');
});
