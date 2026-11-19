// Mail provider routing (no network): console resolves, unknown/missing
// config fails closed with 503, prod guard bans the console provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const KEYS = ['MAIL_PROVIDER', 'DEV_MAIL_SKIP', 'RESEND_API_KEY', 'MAIL_FROM',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS'];

function freshMailer(env) {
  for (const k of Object.keys(require.cache)) {
    if (k.endsWith('src/lib/mailer.js') || k.endsWith('src/config.js')) delete require.cache[k];
  }
  const keep = {};
  for (const k of KEYS) {
    keep[k] = process.env[k];
    process.env[k] = env[k] === undefined ? '' : env[k];
  }
  try {
    return require('./src/lib/mailer.js');
  } finally {
    for (const k of KEYS) {
      if (keep[k] === undefined) delete process.env[k];
      else process.env[k] = keep[k];
    }
  }
}

test('unknown MAIL_PROVIDER fails closed', async () => {
  const m = freshMailer({ MAIL_PROVIDER: 'pigeon' });
  await assert.rejects(m.sendMail({ to: 'a@b.nz', subject: 'x' }), /unknown MAIL_PROVIDER/);
});

test('resend without a key fails closed with 503', async () => {
  const m = freshMailer({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: '' });
  await assert.rejects(m.sendMail({ to: 'a@b.nz', subject: 'x' }), (e) => e.status === 503);
  assert.equal(m.emailConfigured(), false);
});

test('console provider resolves and counts as configured (dev)', async () => {
  const m = freshMailer({ MAIL_PROVIDER: 'console' });
  await m.sendMail({ to: 'a@b.nz', subject: 'hi', text: 'hello' });
  assert.equal(m.emailConfigured(), true);
  assert.equal(m.mailProvider(), 'console');
});

test('DEV_MAIL_SKIP forces console without touching MAIL_PROVIDER', async () => {
  const m = freshMailer({ DEV_MAIL_SKIP: '1' });
  assert.equal(m.mailProvider(), 'console');
  await m.sendMail({ to: 'a@b.nz', subject: 'hi' });
});

test('smtp without a host fails closed with 503', async () => {
  const m = freshMailer({ MAIL_PROVIDER: 'smtp', SMTP_HOST: '' });
  await assert.rejects(m.sendMail({ to: 'a@b.nz', subject: 'x' }), (e) => e.status === 503);
  assert.equal(m.emailConfigured(), false);
});

test('prod guard bans the console provider', async () => {
  const { prodConfigProblems } = require('./src/config.js');
  const out = prodConfigProblems({ NODE_ENV: 'production', MAIL_PROVIDER: 'console' });
  assert.match(out.join('\n'), /MAIL_PROVIDER=console/);
});
