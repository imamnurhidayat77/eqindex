// Cache flush after public data changes: the API's own GET cache and the
// web app's fetch cache (web/app/api/revalidate). No DB or network needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { revalidateWeb } = require('./src/lib/webRevalidate.js');
const { mountCache, bustPublic } = require('./src/middleware/cache.js');

test('revalidateWeb is a no-op until url and secret are configured', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true }; };
  assert.equal(await revalidateWeb({ url: '', secret: 's', fetchImpl }), false);
  assert.equal(await revalidateWeb({ url: 'http://web/api/revalidate', secret: '', fetchImpl }), false);
  assert.equal(called, false);
});

test('revalidateWeb posts the secret header and reports the outcome', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push([url, init]); return { ok: true }; };
  assert.equal(await revalidateWeb({ url: 'http://web/api/revalidate', secret: 'shh', fetchImpl }), true);
  assert.equal(calls[0][0], 'http://web/api/revalidate');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['x-revalidate-secret'], 'shh');
});

test('revalidateWeb never throws when the web app is down', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(await revalidateWeb({ url: 'http://web/api/revalidate', secret: 's', fetchImpl }), false);
  } finally { console.warn = warn; }
});

// Regression: prefixes used to end in '/', so '/riders/sophia-maud' was never
// cleared and a profile kept serving pre-import rounds.
test('bustPublic clears cached rider and horse profiles', () => {
  let mw;
  mountCache({ use: (fn) => { mw = fn; } });
  const get = (path) => {
    let out = null;
    const res = {
      statusCode: 200, set: (k, v) => { out = v; },
      json: (body) => body,
    };
    mw({ method: 'GET', path, originalUrl: path, headers: {} }, res, () => res.json({ path }));
    return out;
  };
  for (const p of ['/riders/sophia-maud', '/horses/avantti', '/events/abc']) {
    assert.equal(get(p), 'MISS', p);
    assert.equal(get(p), 'HIT', p);
  }
  bustPublic();
  for (const p of ['/riders/sophia-maud', '/horses/avantti', '/events/abc']) assert.equal(get(p), 'MISS', p);
});
