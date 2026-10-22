'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { IconSearch, IconHeart, IconUser, IconHome, IconCal, IconGrid } from './icons';

// Header: logo left · centre Events/Photos/Reels · right search, Sell your
// work, favourites, Log in/avatar. Logged-out vs logged-in variants.
export default function Header() {
  const pathname = usePathname() || '/';
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.data?.id || j?.data?.email) setAuthed(true); })
      .catch(() => {});
  }, []);
  const active = (href) => (pathname === href || (href !== '/' && pathname.startsWith(href)))
    ? { 'aria-current': 'page' } : {};
  return (
    <>
      <header className="site-header">
        <div className="bar">
          <Link href="/" className="brand">BOSS&nbsp;MEDIA<small>EST. NZ</small></Link>
          <nav className="site-nav" aria-label="Primary">
            <Link href="/" {...active('/')}>Home</Link>
            <Link href="/photos" {...active('/photos')}>Photos</Link>
            <Link href="/reels" {...active('/reels')}>Reels</Link>
          </nav>
          <div className="header-actions">
            <Link href="/photos" aria-label="Search photos" className="icon-btn"><IconSearch /></Link>
            <Link href="/sell" className="sell-link">Sell your work</Link>
            <Link href="/favourites" aria-label="Favourites" className="icon-btn"><IconHeart /></Link>
            {authed
              ? <Link href="/media" aria-label="Your media" className="icon-btn"><IconUser /></Link>
              : <Link href="/login" className="btn btn-primary btn-sm">Sign in</Link>}
          </div>
        </div>
      </header>
      <nav className="mobile-tabs" aria-label="Mobile">
        <Link href="/" {...(pathname === '/' ? { 'aria-current': 'page' } : {})}><IconHome />Home</Link>
        <Link href="/events" {...(pathname.startsWith('/events') ? { 'aria-current': 'page' } : {})}><IconCal />Events</Link>
        <Link href="/photos" {...(pathname.startsWith('/photos') ? { 'aria-current': 'page' } : {})}><IconGrid />Search</Link>
        <Link href={authed ? '/media' : '/login'} {...((pathname.startsWith('/media') || pathname.startsWith('/login')) ? { 'aria-current': 'page' } : {})}><IconUser />Account</Link>
      </nav>
    </>
  );
}
