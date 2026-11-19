// Sends one of every outbound email template with sample data, so reviewers
// can see exactly what users see — without triggering real flows (no DB
// writes, tokens are clearly marked non-live).
// Usage: node scripts/send-template-previews.mjs you@example.com
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sendMail } = require('../src/lib/mailer.js');
const { APP_URL } = require('../src/config.js');
const t = require('../src/lib/emailTemplates.js');

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('usage: node scripts/send-template-previews.mjs you@example.com');
  process.exit(1);
}

const fakeLink = (kind) => `${APP_URL || 'https://bossmedia.nz'}/reset?token=preview-${kind}-not-live`;
const verifyLink = `${APP_URL || 'https://bossmedia.nz'}/upload/verify?token=preview-verify-not-live`;

const previews = [
  ['auth • claim account', t.claimAccount({ name: 'Jessie', link: fakeLink('claim') })],
  ['auth • reset password', t.resetPassword({ name: 'Jessie', link: fakeLink('reset') })],
  ['inbound • unknown event', t.unknownEvent({
    uploadEmail: 'upload@bossmedia.nz',
    hint: 'TAKAPO26 — Takapoto Classic\nTAUPO26 — Taupo Show',
  })],
  ['inbound • no attachments', t.noAttachments({
    uploadEmail: 'upload@bossmedia.nz', eventName: 'Takapoto Classic', maxFiles: 5,
  })],
  ['inbound • over limits', t.overLimits({ eventName: 'Takapoto Classic', maxFiles: 5 })],
  ['inbound • first-time verify', t.verifySender({
    noun: '3 photos', eventName: 'Takapoto Classic', link: verifyLink, askClaims: true,
  })],
  ['inbound • accepted', t.acceptedIntake({
    count: 2, eventName: 'Takapoto Classic',
    skipped: [{ file: 'clip.mp4', reason: 'video-by-email' }, { file: 'img.HEIC', reason: 'heic' }],
  })],
  ['web • first-time verify', t.verifySender({
    noun: 'video', eventName: 'Takapoto Classic', link: verifyLink, askClaims: false,
  })],
  ['moments • reject', t.momentsReject({
    eventName: 'Takapoto Classic', count: 2, reason: 'too blurry to publish',
  })],
  ['moments • followers live', t.momentsLive({
    name: 'Jessie Goggin', eventName: 'Takapoto Classic',
    link: `${APP_URL || 'https://bossmedia.nz'}/moments?event_id=preview`, forEvent: true,
  })],
  ['purchase • claim photos', t.purchaseClaim({ name: 'Jessie', link: fakeLink('purchase') })],
  ['sponsor • gift credits', t.sponsorGift({
    sponsor: 'Dunstan', slots: 5, scope: 'Takapoto Classic · Tiraumea My Beau',
    claimLink: fakeLink('gift'),
  })],
];

(async () => {
  for (const [label, mail] of previews) {
    // Prefix marks these as samples — recipients never confuse them with live mail.
    const tagged = `[PREVIEW] ${mail.subject}`;
    await sendMail({ to, subject: tagged, text: mail.text, html: mail.html });
    console.log(`sent: ${label} → ${tagged}`);
  }
  console.log(`done: ${previews.length} previews to ${to}`);
})().catch((e) => { console.error('preview failed:', e.message); process.exit(1); });
