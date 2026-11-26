// Pages anyone can open. Everything else needs a session: proxy sends
// visitors without one to /login, so a gated page can assume the user is
// (very likely) signed in before /auth/me answers.
export const PUBLIC_PATHS = new Set([
  '/', '/login', '/register', '/forgot',
  '/about', '/contact', '/privacy', '/terms', '/glossary',
]);
