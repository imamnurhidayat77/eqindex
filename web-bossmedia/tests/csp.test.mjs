// The production CSP must let the 3D preview decode meshopt-compressed
// .glb files (WebAssembly) without allowing JavaScript eval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('production CSP allows wasm but not eval', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const config = require('../next.config.js');
    const [{ headers }] = await config.headers();
    const csp = headers.find((h) => h.key === 'Content-Security-Policy').value;
    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
    assert.match(scriptSrc, /'wasm-unsafe-eval'/);
    assert.doesNotMatch(scriptSrc, /'unsafe-eval'/);
  } finally {
    process.env.NODE_ENV = prev;
  }
});
