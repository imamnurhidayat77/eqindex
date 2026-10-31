import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function majorFloor(range) {
  const majors = [...range.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
  return Math.min(...majors);
}

test('engines.node >= 18 (prod butuh optimizer + fetch modern)', () => {
  assert.ok(pkg.engines?.node, 'engines.node wajib ada');
  assert.ok(majorFloor(pkg.engines.node) >= 18, `engines.node "${pkg.engines.node}" harus >=18`);
});

test('next.config: optimizer AKTIF di prod (images.unoptimized === false)', () => {
  process.env.NODE_ENV = 'production';
  const config = require('../../next.config.js');
  assert.equal(config.images?.unoptimized, false, 'images.unoptimized harus false agar optimizer Next aktif');
  assert.ok(
    Array.isArray(config.images?.remotePatterns) && config.images.remotePatterns.length > 0,
    'remotePatterns wajib ada (cover dari backend/thumb CDN)'
  );
});

test('next.config: headers prod pasang CSP + HSTS', async () => {
  process.env.NODE_ENV = 'production';
  const config = require('../../next.config.js');
  const headers = await config.headers();
  assert.ok(headers.length > 0, 'headers() prod tidak boleh kosong');
  const keys = headers[0].headers.map((h) => h.key);
  assert.ok(keys.includes('Content-Security-Policy'), 'CSP wajib di prod');
  assert.ok(keys.includes('Strict-Transport-Security'), 'HSTS wajib di prod');
});
