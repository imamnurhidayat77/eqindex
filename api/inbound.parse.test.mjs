// Pure unit test: inbound email subject parsing (no server, no DB).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseEventCode, parseMessageId } = require('./src/routes/inbound.js');

test('event code is the first meaningful token, uppercased', () => {
  assert.equal(parseEventCode('TAKAPOTO26 Jessie 1.40m'), 'TAKAPOTO26');
  assert.equal(parseEventCode('takapoto26'), 'TAKAPOTO26');
  assert.equal(parseEventCode('Re: TAKAPOTO26 photos'), 'TAKAPOTO26');
  assert.equal(parseEventCode('Fwd: TAUPO26 Saturday'), 'TAUPO26');
});

test('missing or junk subjects yield no code', () => {
  assert.equal(parseEventCode(''), null);
  assert.equal(parseEventCode('Hi!'), null);
  assert.equal(parseEventCode('Re: photos from Saturday'), null);
  assert.equal(parseEventCode('a-very-long-token-that-is-not-a-code'), null);
});

test('message-id prefers the header, falls back to a stable hash', () => {
  const h = 'From: a@b.nz\r\nMessage-ID: <abc123@x>\r\nSubject: hi';
  assert.equal(parseMessageId(h, ['x']), '<abc123@x>');
  const a = parseMessageId('', ['a@b.nz', 'SUBJ']);
  const b = parseMessageId('', ['a@b.nz', 'SUBJ']);
  assert.equal(a, b);
  assert.match(a, /^hash-[0-9a-f]{32}$/);
});
