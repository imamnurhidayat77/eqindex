import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, normalizeEmail, EMAIL_MAX_LENGTH } from '../lib/validation.mjs';

test('accepts ordinary addresses', () => {
  for (const em of ['you@example.nz', 'First.Last+tag@bossmedia.co.nz', 'rider_99@stable-mail.io', 'a@b.co']) {
    assert.equal(isValidEmail(em), true, em);
  }
});

test('rejects malformed addresses the old short regex let through', () => {
  for (const em of [
    '', ' ', 'plainaddress', '@no-local.nz', 'a b@c.nz', 'a@b',
    'a@b.c', 'a@b.12', 'a@.nz', 'a@b..nz', 'a..b@c.nz', '.a@c.nz',
    'a@c.nz-', 'a@-c.nz', `${'x'.repeat(250)}@c.nz`, 'a@@c.nz',
  ]) {
    assert.equal(isValidEmail(em), false, JSON.stringify(em));
  }
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  You@Example.NZ '), 'you@example.nz');
  assert.equal(normalizeEmail(null), '');
  assert.equal(EMAIL_MAX_LENGTH, 254);
});

test('login/register keep the user-facing error copy', async () => {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const login = readFileSync(join(root, 'components/LoginClient.jsx'), 'utf8');
  const register = readFileSync(join(root, 'components/RegisterClient.jsx'), 'utf8');
  assert.match(login, /Enter your email and password\./);
  assert.match(register, /Please accept the Terms/);
  for (const s of [login, register]) {
    assert.match(s, /isValidEmail/);
    assert.match(s, /normalizeEmail/);
  }
});
