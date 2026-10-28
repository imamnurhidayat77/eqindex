import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const totp = require('./totp.js');

// RFC 6238 Appendix B vectors (SHA-1, secret ASCII '12345678901234567890').
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('hotp matches RFC 6238 vectors', () => {
  assert.equal(totp.hotp(RFC_SECRET, 1), '287082'); // T=59s
  assert.equal(totp.hotp(RFC_SECRET, 37037036), '081804'); // T=1111111109s
});

test('verify accepts current step, rejects garbage', () => {
  const step = Math.floor(Date.now() / 30_000);
  const code = totp.hotp(RFC_SECRET, step);
  assert.ok(totp.verify(code, RFC_SECRET));
  assert.ok(!totp.verify('000000', RFC_SECRET));
  assert.ok(!totp.verify('abcdef', RFC_SECRET));
  assert.ok(!totp.verify('', RFC_SECRET));
});

test('generateSecret yields decodable 160-bit secrets', () => {
  const s = totp.generateSecret();
  assert.ok(/^[A-Z2-7]{32}$/.test(s));
  assert.equal(totp.base32Decode(s).length, 20);
});

test('otpauthUrl parses', () => {
  const u = new URL(totp.otpauthUrl({ issuer: 'Boss Media', account: 'a@b.nz', secret: 'ABC' }));
  assert.equal(u.protocol, 'otpauth:');
  assert.equal(u.searchParams.get('secret'), 'ABC');
});
