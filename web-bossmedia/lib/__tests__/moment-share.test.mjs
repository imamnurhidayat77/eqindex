import test from 'node:test';
import assert from 'node:assert/strict';
import { momentShareView, momentTitle } from '../moment-share.mjs';

const view = (o) => momentShareView({ authLoading: false, role: 'SPONSOR', owned: false, purchaseState: null, ...o });

test('non-sponsors (logged out, public, rider, admin) only get Post', () => {
  for (const role of [undefined, 'PUBLIC', 'RIDER', 'ADMIN']) assert.equal(view({ role, owned: null }), 'post');
});

test('nothing renders while auth or ownership is loading (no wrong-button flash)', () => {
  assert.equal(view({ authLoading: true, role: undefined }), 'none');
  assert.equal(view({ owned: null }), 'none');
});

test('sponsor: buy until paid, confirm on return from Stripe, then licensed', () => {
  assert.equal(view({}), 'buy');
  assert.equal(view({ purchaseState: 'checking' }), 'confirming');
  assert.equal(view({ purchaseState: 'unknown' }), 'confirming');
  assert.equal(view({ purchaseState: 'paid' }), 'licensed');
  assert.equal(view({ owned: true }), 'licensed');
});

test('momentTitle: rider × horse, then rider, then horse, then a generic label', () => {
  assert.equal(momentTitle({ rider: 'Ann', horse: 'Bo' }), 'Ann × Bo');
  assert.equal(momentTitle({ rider: 'Ann' }), 'Ann');
  assert.equal(momentTitle({ horse: 'Bo' }), 'Bo');
  assert.equal(momentTitle({}), 'Community moment');
});
