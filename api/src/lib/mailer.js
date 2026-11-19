// Outbound mail, provider-agnostic: one sendMail interface, the transport is
// picked by MAIL_PROVIDER so switching providers is config-only, never code:
//   resend  — Resend HTTP API (RESEND_API_KEY). Default; production stays here.
//   smtp    — any SMTP host (Gmail app password, SendGrid, Brevo, Mailtrap…).
//             Needs SMTP_HOST (+ PORT/USER/PASS/SECURE). Covers every provider
//             worth using, because they all speak SMTP — no per-vendor SDKs.
//   console — dev only: logs the mail instead of sending. DEV_MAIL_SKIP=1
//             forces this (backward compatible); never use in production.
const { Resend } = require('resend');
const { RESEND_API_KEY, MAIL_FROM, MAIL_PROVIDER, SMTP, DEV_MAIL_SKIP } = require('../config');

let resendClient = null;
function resend() {
  if (!RESEND_API_KEY) {
    const e = new Error('email not configured — set RESEND_API_KEY (and verify the MAIL_FROM domain in Resend)');
    e.status = 503;
    throw e;
  }
  if (!resendClient) resendClient = new Resend(RESEND_API_KEY);
  return resendClient;
}

let smtpTransport = null;
function smtp() {
  if (!SMTP.host) {
    const e = new Error('email not configured — set SMTP_HOST (+ SMTP_USER/SMTP_PASS) or switch MAIL_PROVIDER');
    e.status = 503;
    throw e;
  }
  if (!smtpTransport) {
    const nodemailer = require('nodemailer');
    smtpTransport = nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.secure,
      auth: SMTP.user ? { user: SMTP.user, pass: SMTP.pass } : undefined,
    });
  }
  return smtpTransport;
}

function provider() {
  if (DEV_MAIL_SKIP) return 'console';
  const p = String(MAIL_PROVIDER || 'resend').toLowerCase();
  if (!['resend', 'smtp', 'console'].includes(p)) {
    const e = new Error(`unknown MAIL_PROVIDER "${p}" — use resend|smtp|console`);
    e.status = 503;
    throw e;
  }
  return p;
}

async function sendMail({ to, subject, html, text }) {
  const p = provider();
  if (p === 'console') {
    console.log(`[mail:console] to=${to} subject=${subject}`);
    if (text) console.log(`[mail:console] ${String(text).slice(0, 500)}`);
    return;
  }
  if (p === 'smtp') {
    // Config validation throws 503 OUTSIDE the try: missing credentials is
    // a setup error (fail closed), a failed delivery is a 502.
    const transport = smtp();
    try {
      await transport.sendMail({ from: mailFrom(), to, subject, html, text });
      return;
    } catch (e) {
      const err = new Error(`email failed: ${e.message || 'smtp error'}`);
      err.status = 502;
      throw err;
    }
  }
  const { error } = await resend().emails.send({ from: mailFrom(), to, subject, html, text });
  if (error) {
    const e = new Error(`email failed: ${error.message || 'resend error'}`);
    e.status = 502;
    throw e;
  }
}

function mailFrom() {
  return MAIL_FROM || SMTP.user || 'Boss Media <hello@bossmedia.nz>';
}

function emailConfigured() {
  const p = provider();
  if (p === 'console') return true; // dev escape hatch: the link lands in console
  if (p === 'smtp') return !!SMTP.host;
  return !!RESEND_API_KEY;
}

module.exports = { sendMail, mailFrom, emailConfigured, mailProvider: provider };
