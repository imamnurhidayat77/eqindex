// TOTP (RFC 6238, SHA-1, 30s step, 6 digits) with zero dependencies.
// Secrets are base32 (what authenticator apps import); stored as-is.
const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(s) {
  const clean = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0;
  const out = [];
  for (const ch of clean) {
    val = (val << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateSecret(bytes = 20) {
  let s = '';
  const rnd = crypto.randomBytes(bytes);
  let bits = 0, val = 0;
  for (const b of rnd) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) { s += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) s += B32[(val << (5 - bits)) & 31];
  return s;
}

function hotp(secret, counter) {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

// window: accept ±1 step (clock skew). Constant-time compare.
function verify(token, secret, window = 1) {
  const t = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  const step = Math.floor(Date.now() / 30_000);
  for (let c = step - window; c <= step + window; c++) {
    const expect = hotp(secret, c);
    if (expect.length === t.length && crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(t))) return true;
  }
  return false;
}

function otpauthUrl({ issuer, account, secret }) {
  const q = `secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${q}`;
}

module.exports = { base32Decode, generateSecret, hotp, verify, otpauthUrl };
