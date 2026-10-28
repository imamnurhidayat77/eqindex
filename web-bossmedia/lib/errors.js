// Never render backend messages verbatim: a verbose DB/Stripe error (or a
// stored attacker-crafted string) would leak internals to shoppers.
// safeError shows the message only when it looks like a plain product
// sentence; anything technical falls back to a generic line. The raw text
// still goes to the console for debugging.
const LEAK_RE = /relation\s+"|constraint|pg_|sk_live|secret|password|token|exception|\.js:\d+|\bsql\b|syntax|stack/i;

export function safeError(msg, fallback = 'Something went wrong — try again.') {
  const m = String(msg || '').trim();
  if (!m) return fallback;
  if (LEAK_RE.test(m)) {
    try { console.error('[api error suppressed from UI]', m.slice(0, 300)); } catch {}
    return fallback;
  }
  return m;
}
