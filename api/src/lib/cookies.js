const { SESSION_COOKIE, SESSION_DAYS } = require('../config');

function getCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function cookieOpts(req) {
  // Cross-site web (Vercel) -> API (Cloud Run): browsers only send
  // SameSite=None+Secure cookies on fetch/XHR. Local dev stays Lax.
  const secure = process.env.COOKIE_SECURE === '1' || req.secure;
  return { httpOnly: true, sameSite: secure ? 'none' : 'lax', secure, path: '/' };
}
function setSessionCookie(req, res, token) {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOpts(req), maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  });
}
function clearSessionCookie(req, res) {
  res.clearCookie(SESSION_COOKIE, cookieOpts(req));
}

module.exports = { getCookie, cookieOpts, setSessionCookie, clearSessionCookie };
