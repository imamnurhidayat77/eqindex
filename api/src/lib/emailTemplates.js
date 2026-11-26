// Single source of truth for every outbound email body in the app.
// Pure functions (data in, {subject, text, html} out) so the preview script
// (scripts/send-template-previews.mjs) can render and send each one with
// sample data — no need to trigger real flows to see what users see.
//
// HTML is email-client safe: tables, inline styles only, no webfonts, no
// external images (blocked by default in most inboxes). Dark header + light
// card mirrors the Boss Media storefront.
const escHtml = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const firstName = (n) => String(n || '').split(' ')[0] || 'there';
const FONT = `font-family:Arial,Helvetica,sans-serif;`;

function btn(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px 0;">` +
    `<tr><td align="center" bgcolor="#101010" style="border-radius:10px;">` +
    `<a href="${href}" style="display:inline-block;padding:14px 30px;${FONT}font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escHtml(label)}</a>` +
    `</td></tr></table>`;
}

function layout({ preheader, eyebrow, title, body, footerNote }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:#eceae5;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escHtml(preheader || '')}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eceae5;">` +
    `<tr><td align="center" style="padding:30px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">` +
    `<tr><td align="center" bgcolor="#101010" style="border-radius:14px 14px 0 0;padding:26px 24px;">` +
    `<div style="${FONT}font-size:15px;font-weight:bold;letter-spacing:4px;color:#ffffff;">BOSS&nbsp;MEDIA</div>` +
    `<div style="${FONT}font-size:11px;letter-spacing:2px;color:#a9a9a3;margin-top:6px;">NZ SHOWJUMPING PHOTOS &amp; REELS</div>` +
    `</td></tr>` +
    `<tr><td bgcolor="#ffffff" style="border-radius:0 0 14px 14px;padding:30px 30px 26px 30px;">` +
    (eyebrow ? `<div style="${FONT}font-size:11px;font-weight:bold;letter-spacing:2px;color:#8a8a85;margin-bottom:10px;">${escHtml(eyebrow)}</div>` : '') +
    `<div style="${FONT}font-size:22px;font-weight:bold;line-height:1.3;color:#101010;margin-bottom:14px;">${escHtml(title)}</div>` +
    `<div style="${FONT}font-size:15px;line-height:1.65;color:#333333;">${body}</div>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:18px 12px 0 12px;">` +
    `<div style="${FONT}font-size:12px;line-height:1.6;color:#8a8a85;">${footerNote || 'Boss Media — official event photos &amp; reels from NZ showjumping.'}<br>` +
    `<span style="color:#b5b5b0;">Please do not reply to this email.</span></div>` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;
}

const p = (s) => `<p style="margin:0 0 12px 0;">${s}</p>`;
const fallbackLink = (href) => `<p style="margin:14px 0 0 0;font-size:13px;color:#8a8a85;word-break:break-all;">Button not working? Paste this link into your browser:<br><a href="${href}" style="color:#101010;">${href}</a></p>`;

function claimAccount({ name, link }) {
  return {
    subject: 'Claim your Boss Media account',
    text: `Hi ${name || 'there'},\n\nThis email was used for a guest purchase. Set a password to claim the account and reach your downloads anytime:\n${link}\n\nThis link expires in 1 hour. Didn't buy anything? Ignore this email.`,
    html: layout({
      preheader: 'Claim your account to reach your downloads anytime.',
      eyebrow: 'GUEST PURCHASE',
      title: `Kia ora, ${firstName(name)} — claim your account.`,
      body: p(`This email was used for a guest purchase. Set a password to claim the account and reach your downloads anytime.`) +
        btn(link, 'Claim my account') +
        p(`<span style="color:#8a8a85;">This link expires in 1 hour. Didn't buy anything? Ignore this email.</span>`) +
        fallbackLink(link),
    }),
  };
}

function verifyEmail({ name, link }) {
  return {
    subject: 'Confirm your Boss Media email',
    text: `Hi ${name || 'there'},\n\nConfirm this is your email address:\n${link}\n\nThis link expires in 24 hours. Didn't create an account? Ignore this email.`,
    html: layout({
      preheader: 'Confirm your email to keep your purchases safe.',
      eyebrow: 'ACCOUNT SECURITY',
      title: `Kia ora, ${firstName(name)} — confirm your email.`,
      body: p(`Confirm this is your email address. Photos bought with it as a guest only join an account once the email is confirmed.`) +
        btn(link, 'Confirm my email') +
        p(`<span style="color:#8a8a85;">This link expires in 24 hours. Didn't create an account? Ignore this email.</span>`) +
        fallbackLink(link),
    }),
  };
}

function resetPassword({ name, link }) {
  return {
    subject: 'Reset your Boss Media password',
    text: `Hi ${name || 'there'},\n\nReset your password here (expires in 1 hour):\n${link}\n\nDidn't ask for this? Ignore this email — your password stays as is.`,
    html: layout({
      preheader: 'Reset your password — link expires in 1 hour.',
      eyebrow: 'ACCOUNT SECURITY',
      title: 'Reset your password.',
      body: p(`Hi ${escHtml(firstName(name))} — we received a request to reset the password for this email address.`) +
        btn(link, 'Reset password') +
        p(`<span style="color:#8a8a85;">This link expires in 1 hour. Didn't ask for this? Ignore this email — your password stays as is.</span>`) +
        fallbackLink(link),
    }),
  };
}

function unknownEvent({ uploadEmail, hint }) {
  const codes = String(hint || '').split('\n').filter(Boolean)
    .map((line) => `<div style="background-color:#f4f3ef;border-radius:8px;padding:8px 14px;margin:6px 0;${FONT}font-size:14px;color:#101010;"><strong>${escHtml(line)}</strong></div>`).join('');
  return {
    subject: 'Which event is this for?',
    text: `Hi — we couldn't tell which event your photos belong to. ` +
      `Please resend to ${uploadEmail} with the event code as the first word of the subject line.\n\n${hint || ''}`,
    html: layout({
      preheader: 'Resend with your event code as the first word of the subject.',
      eyebrow: 'COMMUNITY UPLOAD',
      title: 'Which event is this for?',
      body: p(`We couldn't tell which event your photos belong to. Please resend to <strong>${escHtml(uploadEmail)}</strong> with the event code as the first word of the subject line.`) +
        (codes ? p(`Events currently accepting uploads:`) + codes : p(`No events are accepting email uploads right now.`)),
    }),
  };
}

function noAttachments({ uploadEmail, eventName, maxFiles }) {
  return {
    subject: `No photos found — ${eventName}`,
    text: `Hi — your email to ${uploadEmail} had no photo attachments we could use. ` +
      `Please resend with JPEG or PNG photos attached (up to ${maxFiles} per email). ` +
      `Videos can't travel by email — reply to this message and we'll send you an upload link for those.`,
    html: layout({
      preheader: `No usable photos in your email to ${eventName}.`,
      eyebrow: 'COMMUNITY UPLOAD',
      title: `No photos found.`,
      body: p(`Your email about <strong>${escHtml(eventName)}</strong> had no photo attachments we could use. Please resend with JPEG or PNG photos attached (up to ${maxFiles} per email).`) +
        p(`Videos can't travel by email — just reply to this message and we'll send you an upload link for those.`),
    }),
  };
}

function overLimits({ eventName, maxFiles }) {
  return {
    subject: `Too much in one email — ${eventName}`,
    text: `Hi — please keep it to ${maxFiles} photos per email so everything arrives intact, then send the rest in a second email with the same subject code.`,
    html: layout({
      preheader: `Split your photos across multiple emails.`,
      eyebrow: 'COMMUNITY UPLOAD',
      title: `Too much in one email.`,
      body: p(`Please keep it to <strong>${maxFiles} photos per email</strong> so everything arrives intact, then send the rest in a second email with the same subject code (<strong>${escHtml(eventName)}</strong>).`),
    }),
  };
}

function verifySender({ noun, eventName, link, askClaims }) {
  return {
    subject: `One tap to share your ${noun} — ${eventName}`,
    text: `Hi — thanks for sending ${noun} from ${eventName}!\n\n` +
      `Because this is your first time, please confirm it's really you (one tap, no account needed):\n${link}\n\n` +
      (askClaims
        ? `That link also asks who you photographed and records your permission to share. `
        : `That link also records your permission to share. `) +
      `It expires in 48 hours. After that, ${askClaims ? 'future emails' : 'uploads'} from this address skip this step.\n\n— Boss Media`,
    html: layout({
      preheader: 'One tap confirms it’s really you — no account needed.',
      eyebrow: 'COMMUNITY UPLOAD · FIRST TIME',
      title: `One tap to share your ${noun}.`,
      body: p(`Thanks for sharing from <strong>${escHtml(eventName)}</strong>! Because this is your first time, please confirm it's really you — one tap, no account needed.`) +
        btn(link, 'Confirm it’s me') +
        p(`<span style="color:#8a8a85;">${askClaims ? 'That link also asks who you photographed and records your permission to share. ' : 'That link also records your permission to share. '}It expires in 48 hours. After that, ${askClaims ? 'future emails' : 'uploads'} from this address skip this step.</span>`) +
        fallbackLink(link),
    }),
  };
}

function acceptedIntake({ count, eventName, skipped }) {
  const lines = (skipped || []).map((r) => {
    if (r.reason === 'video-by-email') return `• ${r.file}: videos can't travel by email — reply to this message and we'll send you an upload link.`;
    if (r.reason === 'heic') return `• ${r.file}: iPhone HEIC isn't readable here — please resend as JPEG or PNG (Photos → Share → Save as JPEG).`;
    return `• ${r.file}: not a usable photo (${r.reason}).`;
  });
  const skippedHtml = lines.length
    ? `<div style="background-color:#f4f3ef;border-radius:8px;padding:12px 16px;margin:14px 0 0 0;${FONT}font-size:13px;line-height:1.7;color:#555550;">` +
      `<strong>Skipped:</strong><br>${lines.map((l) => escHtml(l)).join('<br>')}</div>`
    : '';
  return {
    subject: `Got ${count ? `${count} photo${count > 1 ? 's' : ''}` : 'your email'} — ${eventName}`,
    text: `Hi — thanks for sharing from ${eventName}!\n\n` +
      (count
        ? `${count} photo${count > 1 ? 's' : ''} received and queued for a quick check. ` +
          `Nothing is published yet — our team reviews every community photo, then followers of the rider get notified.\n`
        : `Nothing could be used this time.\n`) +
      (lines.length ? `\nSkipped:\n${lines.join('\n')}\n` : '') +
      `\n— Boss Media`,
    html: layout({
      preheader: `${count ? `${count} photo${count > 1 ? 's' : ''} queued for review` : 'Nothing usable this time'} — ${eventName}.`,
      eyebrow: 'COMMUNITY UPLOAD',
      title: count ? `Got ${count} photo${count > 1 ? 's' : ''} — thank you!` : `Thanks for sharing!`,
      body: p(`Thanks for sharing from <strong>${escHtml(eventName)}</strong>!`) +
        (count
          ? p(`Your ${count === 1 ? 'photo is' : 'photos are'} queued for a quick check. Nothing is published yet — our team reviews every community photo, then followers of the rider get notified.`)
          : p(`Nothing could be used this time — see the notes below and try again.`)) +
        skippedHtml,
    }),
  };
}

function momentsReject({ eventName, count, reason, webHint }) {
  return {
    subject: `About your photos — ${eventName || 'your event'}`,
    text: `Hi — thanks for sharing from ${eventName || 'the event'}. ` +
      `We couldn't publish ${count} photo${count > 1 ? 's' : ''} this time: ${reason}\n\n` +
      (webHint || `You're welcome to send others — same address, same event code.`) +
      `\n\n— Boss Media`,
    html: layout({
      preheader: `We couldn't publish your photos this time — here's why.`,
      eyebrow: 'COMMUNITY UPLOAD',
      title: `About your photos.`,
      body: p(`Thanks for sharing from <strong>${escHtml(eventName || 'the event')}</strong>. We couldn't publish ${count} photo${count > 1 ? 's' : ''} this time:`) +
        `<div style="background-color:#f4f3ef;border-radius:8px;padding:12px 16px;margin:0 0 14px 0;${FONT}font-size:14px;color:#101010;"><strong>${escHtml(reason)}</strong></div>` +
        p(`${escHtml(webHint || `You're welcome to send others — same address, same event code.`)}`),
    }),
  };
}

function momentsLive({ name, eventName, link, forEvent }) {
  return {
    subject: `New community moments${eventName ? ` — ${eventName}` : ''}`,
    text: `Hi${name ? ` ${firstName(name)}` : ''} — fresh spectator moments were just published` +
      `${eventName ? ` from ${eventName}` : ''}.\n\nSee them here:\n${link}\n\n` +
      `You're getting this because you follow ${forEvent ? 'this event' : 'this horse or rider'} on Boss Media. ` +
      `Unfollow from your watchlist to stop these emails.\n\n— Boss Media`,
    html: layout({
      preheader: `Fresh spectator moments just published${eventName ? ` from ${eventName}` : ''}.`,
      eyebrow: `FRESH FROM THE RAIL${eventName ? ` · ${escHtml(eventName).toUpperCase()}` : ''}`,
      title: `New community moments${eventName ? ` at ${eventName}` : ''}.`,
      body: p(`Hi ${escHtml(firstName(name))} — fresh spectator moments were just published${eventName ? ` from <strong>${escHtml(eventName)}</strong>` : ''}.`) +
        btn(link, 'View the moments') +
        p(`<span style="color:#8a8a85;">You're getting this because you follow ${forEvent ? 'this event' : 'this horse or rider'} on Boss Media. Unfollow from your watchlist to stop these emails.</span>`) +
        fallbackLink(link),
    }),
  };
}

function purchaseClaim({ name, link }) {
  return {
    subject: 'Your Boss Media photos are ready',
    text: `Hi ${name || 'there'},\n\nThanks for your purchase! Set a password to access your downloads anytime:\n${link}\n\nThis link expires in 1 hour. Didn't buy anything? Ignore this email.`,
    html: layout({
      preheader: 'Set a password to access your downloads anytime.',
      eyebrow: 'ORDER COMPLETE',
      title: 'Your photos are ready.',
      body: p(`Hi ${escHtml(firstName(name))} — thanks for your purchase! Set a password to access your downloads anytime. Re-downloads stay free, forever.`) +
        btn(link, 'Set password & view photos') +
        p(`<span style="color:#8a8a85;">This link expires in 1 hour. Didn't buy anything? Ignore this email.</span>`) +
        fallbackLink(link),
    }),
  };
}

function sponsorGift({ sponsor, slots, scope, claimLink }) {
  return {
    subject: `${sponsor} gifted you ${slots} photo credits — ${scope}`,
    text: `Hi there,\n\n${sponsor} gifted you ${slots} photo credits for ${scope}. Sign in with this email to unlock your winning photos — re-downloads stay free.` +
      `${claimLink ? `\nSet a password to access them anytime: ${claimLink} (link expires in 1 hour — you can always request a new one at sign-in).` : ''}\n\nDidn't expect this? Ignore this email.`,
    html: layout({
      preheader: `${sponsor} gifted you ${slots} photo credits.`,
      eyebrow: `A GIFT FROM ${escHtml(sponsor).toUpperCase()}`,
      title: `${slots} photo credits — on ${sponsor}.`,
      body: p(`<strong>${escHtml(sponsor)}</strong> gifted you <strong>${slots} photo credits</strong> for ${escHtml(scope)}. Sign in with this email to unlock your winning photos — re-downloads stay free.`) +
        (claimLink ? btn(claimLink, 'Claim my credits') : '') +
        p(`<span style="color:#8a8a85;">${claimLink ? 'Set-password link expires in 1 hour — you can always request a new one at sign-in. ' : ''}Didn't expect this? Ignore this email.</span>`) +
        (claimLink ? fallbackLink(claimLink) : ''),
    }),
  };
}

// Merch order received (pay after the proof is approved, so no charge yet).
function merchOrderReceived({ name, ref, productLabel, units, totalText, link }) {
  return {
    subject: `Order ${ref} received — artwork check next`,
    text: `Hi ${name || 'there'},\n\nThanks for your ${productLabel} order (${units} item${units === 1 ? '' : 's'}, estimated ${totalText} incl. GST).\n\nWhat happens next: we check your artwork and send a proof. You pay only after you approve the proof.\n\nTrack your order: ${link}\n\nReference: ${ref}`,
    html: layout({
      preheader: 'We check your artwork, then send a proof to approve.',
      eyebrow: `ORDER ${escHtml(ref)}`,
      title: `Kia ora, ${escHtml(firstName(name))} — order received.`,
      body: p(`Thanks for your ${escHtml(productLabel)} order: ${units} item${units === 1 ? '' : 's'}, estimated ${escHtml(totalText)} incl. GST.`) +
        p('Next we check your artwork and send a proof. <strong>You pay only after you approve it.</strong>') +
        btn(link, 'Track my order') +
        fallbackLink(link),
    }),
  };
}

// The buyer asked for their order links again (lost the email, other
// browser). One mail lists their recent orders, each with its own link.
function merchOrderLinks({ orders }) {
  const rows = orders.map((o) => `${o.ref}: ${o.productLabel} (${o.statusText})`);
  return {
    subject: 'Your Boss Media merch orders',
    text: `Hi there,\n\nHere are the links to your merch orders:\n\n${orders.map((o, i) => `${rows[i]}\n${o.link}`).join('\n\n')}\n\nIf you did not ask for this, you can ignore this email.`,
    html: layout({
      preheader: 'Open any order to see its proof, payment and delivery.',
      eyebrow: 'MERCH ORDERS',
      title: 'Your order links.',
      body: p('Here are the links to your merch orders. Each one opens the order with its proof, payment and delivery.') +
        orders.map((o) => p(`<strong>${escHtml(o.ref)}</strong> · ${escHtml(o.productLabel)} · ${escHtml(o.statusText)}<br><a href="${o.link}">Open order ${escHtml(o.ref)}</a>`)).join('') +
        p('If you did not ask for this, you can ignore this email.'),
    }),
  };
}

// Art proof ready for the buyer. The thumbnail is a convenience only: many
// inboxes block images, so the button and text carry the whole message.
function merchProofReady({ name, ref, productLabel, note, link, proofUrl, views = 1 }) {
  // Several files: say how many views wait on the order page.
  const more = views > 1 ? ` It has ${views} views (for example front, back and sides): see them all on your order page.` : '';
  return {
    subject: `Your artwork proof is ready — order ${ref}`,
    text: `Hi ${name || 'there'},\n\nYour artwork proof for the ${productLabel} order is ready.${more}${note ? `\n\nNote from us: ${note}` : ''}\n\nCheck it and approve it, or ask for changes: ${link}\n\nYou pay only after you approve the proof.\n\nReference: ${ref}`,
    html: layout({
      preheader: 'Approve it, or tell us what to change.',
      eyebrow: `ORDER ${escHtml(ref)}`,
      title: 'Your artwork proof is ready.',
      body: p(`Hi ${escHtml(firstName(name))}, here is the proof for your ${escHtml(productLabel)} order.${escHtml(more)}`) +
        (proofUrl ? `<a href="${link}"><img src="${proofUrl}" width="540" alt="Artwork proof for order ${escHtml(ref)}" style="display:block;width:100%;max-width:540px;height:auto;border:1px solid #dddddd;border-radius:8px;margin:8px 0;"></a>` : '') +
        (note ? p(`<strong>Note from us:</strong> ${escHtml(note)}`) : '') +
        p('Approve it, or tell us what to change. <strong>You pay only after you approve it.</strong>') +
        btn(link, 'Review my proof') +
        fallbackLink(link),
    }),
  };
}

// Buyer answered a proof (to the admins).
function merchProofAnswered({ ref, buyerName, productLabel, approved, note, link }) {
  const what = approved ? 'approved the proof' : 'asked for changes';
  return {
    subject: `Order ${ref}: ${approved ? 'proof approved' : 'changes requested'}`,
    text: `${buyerName || 'The buyer'} ${what} for order ${ref} (${productLabel}).${note ? `\n\nTheir note: ${note}` : ''}\n\nOpen Studio > Admin > Merch orders: ${link}`,
    html: layout({
      preheader: `${buyerName || 'The buyer'} ${what}.`,
      eyebrow: `ORDER ${escHtml(ref)}`,
      title: approved ? 'Proof approved.' : 'Changes requested.',
      body: p(`${escHtml(buyerName || 'The buyer')} ${what} for order ${escHtml(ref)} (${escHtml(productLabel)}).`) +
        (note ? p(`<strong>Their note:</strong> ${escHtml(note)}`) : '') +
        btn(link, 'Open merch orders') +
        fallbackLink(link),
    }),
  };
}

// Merch order paid: receipt for the buyer.
function merchOrderPaid({ name, ref, productLabel, totalText, link }) {
  return {
    subject: `Payment received — order ${ref}`,
    text: `Hi ${name || 'there'},\n\nWe received ${totalText} (incl. GST) for your ${productLabel} order. It goes into production now and we will let you know when it ships.\n\nTrack your order: ${link}\n\nReference: ${ref}`,
    html: layout({
      preheader: 'Your order goes into production now.',
      eyebrow: `ORDER ${escHtml(ref)}`,
      title: 'Payment received, thank you.',
      body: p(`Hi ${escHtml(firstName(name))}, we received <strong>${escHtml(totalText)}</strong> (incl. GST) for your ${escHtml(productLabel)} order.`) +
        p('It goes into production now. We will let you know when it ships.') +
        btn(link, 'Track my order') +
        fallbackLink(link),
    }),
  };
}

// Merch order paid: heads-up for the admins.
function merchOrderPaidAdmin({ ref, buyerName, productLabel, totalText, link }) {
  return {
    subject: `Order ${ref} paid — ready for production`,
    text: `${buyerName || 'The buyer'} paid ${totalText} for order ${ref} (${productLabel}).\n\nOpen Studio > Admin > Merch orders: ${link}`,
    html: layout({
      preheader: `${buyerName || 'The buyer'} paid ${totalText}.`,
      eyebrow: `ORDER ${escHtml(ref)}`,
      title: 'Order paid.',
      body: p(`${escHtml(buyerName || 'The buyer')} paid <strong>${escHtml(totalText)}</strong> for order ${escHtml(ref)} (${escHtml(productLabel)}). It is ready for production.`) +
        btn(link, 'Open merch orders') +
        fallbackLink(link),
    }),
  };
}

// Merch order shipped (courier) or ready to collect (club pickup).
function merchOrderShipped({ name, ref, productLabel, pickup, club, tracking, link }) {
  const where = pickup ? `ready to collect${club ? ` from ${club}` : ''}` : 'on its way';
  return {
    subject: pickup ? `Order ${ref} is ready to collect` : `Order ${ref} has shipped`,
    text: `Hi ${name || 'there'},\n\nYour ${productLabel} order is ${where}.${tracking ? `\n\n${pickup ? 'Pickup details' : 'Tracking'}: ${tracking}` : ''}\n\nOrder details: ${link}\n\nReference: ${ref}`,
    html: layout({
      preheader: pickup ? 'Your order is ready to collect.' : 'Your order is on its way.',
      eyebrow: `ORDER ${escHtml(ref)}`,
      title: pickup ? 'Ready to collect.' : 'Your order has shipped.',
      body: p(`Hi ${escHtml(firstName(name))}, your ${escHtml(productLabel)} order is ${escHtml(where)}.`) +
        (tracking ? p(`<strong>${pickup ? 'Pickup details' : 'Tracking'}:</strong> ${escHtml(tracking)}`) : '') +
        btn(link, 'View my order') +
        fallbackLink(link),
    }),
  };
}

module.exports = {
  verifyEmail,
  claimAccount, resetPassword, unknownEvent, noAttachments, overLimits,
  verifySender, acceptedIntake, momentsReject, momentsLive, purchaseClaim,
  sponsorGift, merchOrderReceived, merchOrderLinks, merchProofReady, merchProofAnswered, merchOrderPaid, merchOrderPaidAdmin, merchOrderShipped,
};
