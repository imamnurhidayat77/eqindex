// Asks the web app (Next.js) to drop its cached API responses after public
// data changes, so a profile never shows pre-import rounds on its next view.
// Fire-and-forget: a failure is logged and never fails the admin request.
const config = require('../config');

const TIMEOUT_MS = 3000;

async function revalidateWeb({
  url = config.WEB_REVALIDATE_URL,
  secret = config.REVALIDATE_SECRET,
  fetchImpl = fetch,
} = {}) {
  if (!url || !secret) return false;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.warn('[revalidate] web answered', res.status);
    return res.ok;
  } catch (e) {
    console.warn('[revalidate] web unreachable:', e.message);
    return false;
  }
}

module.exports = { revalidateWeb };
