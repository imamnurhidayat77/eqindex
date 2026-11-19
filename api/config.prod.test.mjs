// Pure unit test: production boot guard (no server, no DB).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { prodConfigProblems } = require('./src/config.js');

test('non-production never blocks boot', () => {
  for (const env of [{}, { NODE_ENV: 'test' }, { NODE_ENV: 'development' }]) {
    assert.deepEqual(prodConfigProblems(env), []);
  }
});

test('production requires WEB_ORIGIN, APP_URL, STRIPE_WEBHOOK_SECRET', () => {
  const problems = prodConfigProblems({ NODE_ENV: 'production' });
  assert.equal(problems.length, 3, JSON.stringify(problems));
});

test('DEV_MAIL_SKIP=1 is refused in production', () => {
  const problems = prodConfigProblems({
    NODE_ENV: 'production', WEB_ORIGIN: 'https://x.nz', APP_URL: 'https://x.nz',
    STRIPE_WEBHOOK_SECRET: 'whsec_x', DEV_MAIL_SKIP: '1',
  });
  assert.deepEqual(problems, ['DEV_MAIL_SKIP must never be 1 in production']);
});

test('complete production env passes', () => {
  assert.deepEqual(prodConfigProblems({
    NODE_ENV: 'production', WEB_ORIGIN: 'https://x.nz', APP_URL: 'https://x.nz',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
  }), []);
});
