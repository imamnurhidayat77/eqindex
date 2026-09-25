import { NextResponse } from 'next/server';

// Unauthenticated /admin* visits bounce to /login (role checks stay API-side).
export function middleware(req) {
  if (req.nextUrl.pathname.startsWith('/admin') && !req.cookies.get('eq_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
