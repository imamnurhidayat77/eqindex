// Unit: pre-book reel file rules and the "reel updated" wording (no DB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reelMediaError, reelUpdatedCopy } = require('./src/lib/reelOrders.js');

test('a ready or delivered reel can be swapped but not removed, cancelled is locked', () => {
  assert.equal(reelMediaError('delivered', 'm2'), null);
  assert.equal(reelMediaError('ready', 'm2'), null);
  assert.equal(reelMediaError('in_production', null), null);
  assert.ok(reelMediaError('delivered', null));
  assert.ok(reelMediaError('ready', ''));
  assert.ok(reelMediaError('cancelled', 'm2'));
});

test('reel updated copy reads right with and without details', () => {
  const full = reelUpdatedCopy({ product_name: 'Event edit', horse_name: 'Bruno', event_name: 'Wanganui 2026' });
  assert.match(full.body, /Event edit of Bruno from Wanganui 2026/);
  const bare = reelUpdatedCopy({});
  assert.match(bare.body, /your pre-book reel\. /);
  assert.ok(!/undefined|null/.test(full.body + bare.body));
});
