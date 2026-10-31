// Single source of truth for email checks (login, register, guest checkout,
// credit top-ups). Frontend mirrors the backend rule: one @, dot in domain,
// sane lengths — specific enough to catch typos, loose enough to never block
// a real address the backend would accept.
export const EMAIL_MAX_LENGTH = 254;

export function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

// Practical RFC-5322 subset (same shape most backends enforce).
export function isValidEmail(v) {
  const s = String(v || '').trim();
  if (!s || s.length > EMAIL_MAX_LENGTH || s.includes(' ')) return false;
  const at = s.indexOf('@');
  if (at <= 0 || at !== s.lastIndexOf('@') || at > 64) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!local || local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  if (!domain || domain.length > 253 || !domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false;
  const labels = domain.split('.');
  for (const l of labels) {
    if (!l || l.length > 63) return false;
    if (l.startsWith('-') || l.endsWith('-')) return false;
    if (!/^[A-Za-z0-9-]+$/.test(l)) return false;
  }
  // TLD must be letters only, min 2 — rejects `a@b.c`, `a@b.12`, `a@1.2.3.4`.
  if (!/^[A-Za-z]{2,}$/.test(labels[labels.length - 1])) return false;
  return true;
}

export const EMAIL_ERROR = 'Enter a valid email address.';
