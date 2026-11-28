import test from 'node:test';
import assert from 'node:assert/strict';
import { readMerchSettingsForm } from '../merch-settings-form.mjs';

const good = {
  courierCents: '12', freeOverCents: '250', fallbackSponsorDiscountCents: '5',
  sponsorCapCents: '300', uploadLogoCents: '2.50', maxDiscountPct: '40', sponsorDiscountOncePerItem: true,
};

test('dollars become whole cents for the API', () => {
  const { body, errors } = readMerchSettingsForm(good);
  assert.deepEqual(errors, {});
  assert.deepEqual(body, {
    sponsorDiscountOncePerItem: true, courierCents: 1200, freeOverCents: 25000,
    fallbackSponsorDiscountCents: 500, sponsorCapCents: 30000, uploadLogoCents: 250, maxDiscountPct: 40,
  });
  assert.equal('pickupEnabled' in body, false);
});

test('blank, negative, too big and non-whole percent are flagged per field', () => {
  const { errors } = readMerchSettingsForm({ ...good, courierCents: ' ', freeOverCents: '-1', uploadLogoCents: '1001', maxDiscountPct: '12.5' });
  assert.deepEqual(Object.keys(errors).sort(), ['courierCents', 'freeOverCents', 'maxDiscountPct', 'uploadLogoCents']);
  assert.match(errors.uploadLogoCents, /NZ\$1000\./);
  assert.match(readMerchSettingsForm({ ...good, maxDiscountPct: '95' }).errors.maxDiscountPct, /0 to 90/);
});
