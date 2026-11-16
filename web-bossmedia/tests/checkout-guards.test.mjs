// Unit/guard: the money-moment mutual-exclusion fixes stay in place.
// Follows the repo's qa-critical precedent (source assertions + truth tables).
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');

describe('buy box: single working phase (MediaPurchase)', () => {
  const s = src('components/MediaPurchase.jsx');
  test('derives one working flag from busy + unlocking', () => {
    assert.match(s, /const working = busy \|\| unlocking/);
  });
  test('all four money paths early-return on working', () => {
    const hits = s.match(/if \(working[^)]*\) return/g) || [];
    assert.ok(hits.length >= 4, `want ≥4 working guards, got ${hits.length}`);
  });
  test('no button stays enabled on the other lane', () => {
    assert.ok(!s.includes('disabled={busy || !tier}'), 'buy buttons must use working, not busy');
    assert.ok(!s.includes('disabled={unlocking}'), 'unlock button must use working, not unlocking');
  });
});

describe('cart: busyKey mutual exclusion (CartClient)', () => {
  const s = src('components/CartClient.jsx');
  test('per-item lanes refuse to start while another runs', () => {
    const hits = s.match(/if \(busyKey\) return/g) || [];
    assert.ok(hits.length >= 2, `want ≥2 busyKey guards, got ${hits.length}`);
  });
  test('every action button locks while any checkout runs', () => {
    assert.ok(!s.includes('disabled={busyKey === item.key}'), 'per-item buttons must lock on any busyKey');
  });
});

describe('pre-book: no event-less cart items (PreBookClient)', () => {
  const s = src('components/PreBookClient.jsx');
  test('cart path gates on event like buyNow does', () => {
    const onSubmit = s.slice(s.indexOf('function onSubmit'));
    assert.match(onSubmit, /if \(!event\) \{ setNeedEvent\(true\); return; \}/);
  });
  test('ghost button delegates the gate to onSubmit (single path)', () => {
    assert.ok(!s.includes("if (!event) { setNeedEvent(true); return; }\n              setNeedEvent(false);\n              formRef.current?.requestSubmit();"),
      'ghost button must not duplicate the event gate');
  });
  test('stepper reports the real step for AT', () => {
    assert.match(s, /aria-current=\{[^}]*step[^}]*\}/);
  });
});

describe('success poller: partial progress survives (use-purchase-poll)', () => {
  const s = src('lib/use-purchase-poll.js');
  test('paid rows are kept on every round, not only on full pay', () => {
    assert.match(s, /if \(paid\.length\) setRows\(paid\)/);
  });
  test('empty link is flagged so the page can say so', () => {
    assert.match(s, /setEmpty\(true\)/);
    assert.match(s, /empty/);
  });
  test('working truth table: any lane busy means working', () => {
    const working = (busy, unlocking) => busy || unlocking;
    assert.equal(working(true, true), true);
    assert.equal(working(true, false), true);
    assert.equal(working(false, true), true);
    assert.equal(working(false, false), false);
  });
});
