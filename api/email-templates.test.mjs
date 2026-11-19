// Every template renders a non-empty subject + text with no "undefined"
// leaks — catches interpolation mistakes after refactors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const t = require('./src/lib/emailTemplates.js');

const samples = {
  claimAccount: [{ name: 'Jessie', link: 'http://x/reset?token=a' }],
  resetPassword: [{ name: 'Jessie', link: 'http://x/reset?token=a' }],
  unknownEvent: [{ uploadEmail: 'u@x.nz', hint: 'TAKAPO26 — Takapoto' }],
  noAttachments: [{ uploadEmail: 'u@x.nz', eventName: 'E', maxFiles: 5 }],
  overLimits: [{ eventName: 'E', maxFiles: 5 }],
  verifySender: [{ noun: '3 photos', eventName: 'E', link: 'http://x/v?t=a', askClaims: true }],
  acceptedIntake: [{ count: 2, eventName: 'E', skipped: [{ file: 'a.mp4', reason: 'video-by-email' }] }],
  momentsReject: [{ eventName: 'E', count: 2, reason: 'blurry' }],
  momentsLive: [{ name: 'Jessie G', eventName: 'E', link: 'http://x/m?e=1', forEvent: true }],
  purchaseClaim: [{ name: 'Jessie', link: 'http://x/reset?token=a' }],
  sponsorGift: [{ sponsor: 'Dunstan', slots: 5, scope: 'E · H', claimLink: 'http://x/reset?token=a' }],
};

test('every template renders subject + text + branded html without leaks', () => {
  for (const [name, args] of Object.entries(samples)) {
    const mail = t[name](...args);
    assert.ok(mail.subject && mail.subject.length > 3, `${name}: subject`);
    assert.ok(mail.text && mail.text.length > 10, `${name}: text`);
    assert.ok(!/undefined|NaN|object Object/.test(mail.subject + mail.text), `${name}: no leaks`);
    assert.ok(mail.html && mail.html.length > 200, `${name}: html present`);
    assert.ok(!/undefined/.test(mail.html), `${name}: html no leaks`);
    assert.ok(mail.html.includes('BOSS'), `${name}: brand header`);
    assert.ok(mail.html.includes('Please do not reply'), `${name}: footer`);
  }
});

test('pluralization and counts read naturally', () => {
  assert.match(t.acceptedIntake({ count: 1, eventName: 'E', skipped: [] }).subject, /^Got 1 photo —/);
  assert.match(t.acceptedIntake({ count: 3, eventName: 'E', skipped: [] }).subject, /^Got 3 photos —/);
  assert.match(t.momentsReject({ eventName: 'E', count: 1, reason: 'x' }).text, /1 photo /);
});
