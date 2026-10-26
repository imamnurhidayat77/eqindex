// Outbound mail via Resend. Fails safe: when RESEND_API_KEY is unset the
// call throws a 503-style error instead of silently swallowing — callers
// must never fall back to leaking secrets (e.g. reset tokens) in responses.
const { Resend } = require('resend');
const { RESEND_API_KEY, MAIL_FROM } = require('../config');

const FROM = MAIL_FROM;

let client = null;
function resend() {
  if (!RESEND_API_KEY) {
    const e = new Error('email not configured — set RESEND_API_KEY (and verify the MAIL_FROM domain in Resend)');
    e.status = 503;
    throw e;
  }
  if (!client) client = new Resend(RESEND_API_KEY);
  return client;
}

async function sendMail({ to, subject, html, text }) {
  const { error } = await resend().emails.send({ from: FROM, to, subject, html, text });
  if (error) {
    const e = new Error(`email failed: ${error.message || 'resend error'}`);
    e.status = 502;
    throw e;
  }
}

module.exports = { sendMail, mailFrom: () => FROM };
