import { NextResponse } from 'next/server';

// Public pages — everything else requires a valid session (else → /login).
const PUBLIC = new Set([
  '/', '/login', '/register',
  '/about', '/contact', '/privacy', '/terms', '/glossary',
]);

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function safeNext(v) {
  return v && v.startsWith('/') && !v.startsWith('//') && v !== '/login' && v !== '/register'
    ? v : '/watchlist';
}

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  // Logged-in visitors have no business on login/register — bounce them forward.
  if (pathname === '/login' || pathname === '/register') {
    const token = req.cookies.get('eq_session')?.value;
    if (!token) return NextResponse.next();
    try {
      const r = await fetch(`${API}/auth/me`, {
        headers: { cookie: `eq_session=${token}` },
      });
      if (r.ok) return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url));
      const res = NextResponse.next();
      res.cookies.set('eq_session', '', { path: '/', maxAge: 0 });
      return res;
    } catch {
      return NextResponse.next();
    }
  }
  if (PUBLIC.has(pathname)) return NextResponse.next();

  const loginUrl = new URL('/login', req.url);
  const dest = `${pathname}${search}`;
  loginUrl.searchParams.set('next', dest.startsWith('/') && !dest.startsWith('//') ? dest : '/dashboard');

  const token = req.cookies.get('eq_session')?.value;
  if (!token) return NextResponse.redirect(loginUrl);

  // Opaque token — must be validated against the session store (presence alone proves nothing).
  try {
    const r = await fetch(`${API}/auth/me`, {
      headers: { cookie: `eq_session=${token}` },
    });
    if (!r.ok) {
      const res = NextResponse.redirect(loginUrl);
      res.cookies.set('eq_session', '', { path: '/', maxAge: 0 });
      return res;
    }
  } catch {
    // API unreachable — fail closed rather than serve gated pages blind.
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$).*)',
  ],
};
