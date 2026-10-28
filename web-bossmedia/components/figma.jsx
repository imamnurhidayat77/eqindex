'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cartCount, onCartChange } from '../lib/cart';
import { favCount, onFavChange } from '../lib/favourites';
import SearchSelect from './SearchSelect';

export function Icon({ name, size = 18 }) {
  const paths = {
    search: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
    grid: (<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>),
    list: (<><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>),
    calendar: (<><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>),
    cart: (<><path d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>),
    arrow: (<><path d="M5 19 19 5M9 5h10v10" /></>),
    play: <path d="m9 7 8 5-8 5V7Z" />,
    pause: (<><path d="M9 5v14M15 5v14" /></>),
    sound: (<><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>),
    muted: (<><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="m16 10 5 5M21 10l-5 5" /></>),
    expand: (<><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></>),
    close: <path d="M5 5l14 14M19 5 5 19" />,
    heart: <path d="M12 20.5C7 16.5 3 13.3 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 4-4 7.2-9 11.2Z" />,
    'heart-fill': <path d="M12 20.5C7 16.5 3 13.3 3 9.3 3 6.4 5.2 4.5 7.7 4.5c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.5 0 4.7 1.9 4.7 4.8 0 4-4 7.2-9 11.2Z" fill="currentColor" stroke="none" />,
    menu: <path d="M3 7h18M3 17h18" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    instagram: (<><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.2 6.8h.01" /></>),
    facebook: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3V2Z" />,
  };
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

export function Filter({ label, value, options, onChange }) {
  return (
    <label className="filter">
      <span>{label}</span>
      <SearchSelect options={options.map((o) => ({ id: o, label: o }))} value={value}
        onChange={(id) => onChange(id)} placeholder={label} clearable={false} />
    </label>
  );
}

const NAV = [
  ['/events', 'Event galleries', 'events'],
  ['/pre-book', 'Pre-book', 'pre-book'],
  ['/reels', 'Reels', 'reels'],
];

export function SiteHeader({ transparent = false }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [count, setCount] = useState(0);
  // Default to logged-OUT so "Sign in" (SSR + first paint) never flashes
  // invisible. The session check below swaps in the avatar when logged in.
  const [me, setMe] = useState(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const studio = !!me && (me.role === 'PHOTOGRAPHER' || me.role === 'ADMIN');
  const organizer = !!me && (me.role === 'ORGANIZER' || me.role === 'ADMIN');
  const active = pathname.startsWith('/events') ? 'events'
    : pathname === '/pre-book' ? 'pre-book'
    : pathname === '/reels' ? 'reels' : null;

  useEffect(() => { setCount(cartCount()); return onCartChange(() => setCount(cartCount())); }, [pathname]);
  const [favs, setFavs] = useState(0);
  useEffect(() => { setFavs(favCount()); return onFavChange(() => setFavs(favCount())); }, [pathname]);
  useEffect(() => {
    setAcctOpen(false);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    fetch('/api/auth/me', { credentials: 'include', signal: ctl.signal }).then((r) => (r.ok ? r.json() : null))
      .then((j) => setMe(j?.data || null))
      .catch(() => setMe(null))
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [pathname]);
  async function signOut() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* offline — still clear local state */ }
    setMe(null); setAcctOpen(false); setMenuOpen(false);
    window.location.href = '/';
  }
  const initial = (me?.name || me?.email || '?').trim().charAt(0).toUpperCase() || '?';
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);
  useEffect(() => {
    if (!acctOpen) return;
    const close = (e) => { if (e.key === 'Escape') setAcctOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [acctOpen]);

  return (
    <>
      <header className={`header${transparent ? '' : ' utility-header'}`}>
        <Link href="/" className="wordmark" aria-label="Boss Media home">BOSS<span>MEDIA</span></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {NAV.map(([href, label, key]) => (
            <Link key={href} href={href} aria-current={active === key ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        <div className="header-actions">
          {me && (
            <Link href="/favourites" className="icon-button" aria-label="View favourites">
              <Icon name="heart" /><span>{favs}</span>
            </Link>
          )}
          <Link href="/cart" className="icon-button cart" aria-label="View cart">
            <Icon name="cart" /><span>{count}</span>
          </Link>
          {me ? (
            <div className="acct">
              <button type="button" className="acct-btn" aria-label={`Account — ${me.name || me.email}`} aria-expanded={acctOpen} aria-haspopup="menu" onClick={() => setAcctOpen((v) => !v)}>
                <span className="acct-avatar" aria-hidden="true">{initial}</span>
                <span className="acct-name">{(me.name || me.email || '').split(' ')[0]}</span>
                <Icon name="chevron" size={13} />
              </button>
              {acctOpen && (
                <>
                  <button type="button" className="acct-scrim" aria-label="Close account menu" onClick={() => setAcctOpen(false)} tabIndex={-1} />
                  <div className="acct-menu" role="menu">
                    <p className="acct-who">{me.name || me.email}<small>{me.role?.toLowerCase()}</small></p>
                    {studio && <Link href="/studio" role="menuitem" onClick={() => setAcctOpen(false)}>My Studio</Link>}
                    {organizer && <Link href="/organizer" role="menuitem" onClick={() => setAcctOpen(false)}>My events</Link>}
                    <Link href="/account" role="menuitem" onClick={() => setAcctOpen(false)}>My account</Link>
                    <Link href="/media" role="menuitem" onClick={() => setAcctOpen(false)}>My media</Link>
                    <Link href="/watchlist" role="menuitem" onClick={() => setAcctOpen(false)}>Watchlist</Link>
                    <button type="button" role="menuitem" className="acct-signout" onClick={signOut}>Sign out</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/login" className="signin">Sign in</Link>
          )}
          <button className="icon-button menu-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Icon name="menu" size={22} />
          </button>
        </div>
      </header>
      {menuOpen && (
        <div className="mobile-menu">
          <div className="mobile-menu-top">
            <Link href="/" className="wordmark inverted" onClick={() => setMenuOpen(false)}>BOSS<span>MEDIA</span></Link>
            <button className="icon-button inverted" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
              <Icon name="close" size={24} />
            </button>
          </div>
          <nav>
            {[...NAV.map(([href, label]) => ({ href, label })),
              ...(studio ? [{ href: '/studio', label: `My Studio · ${(me?.name || '').split(' ')[0] || 'photo'}` }] : []),
              ...(organizer ? [{ href: '/organizer', label: 'My events' }] : []),
              ...(me ? [{ href: '/account', label: 'My account' }, { href: '/media', label: 'My media' }, { href: '/watchlist', label: 'Watchlist' }] : [{ href: '/login', label: 'Sign in' }]),
              { href: '/cart', label: 'Cart' },
            ].map((l, i) => (
              <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                <span>{`0${i + 1}`}</span>{l.label} <Icon name="arrow" />
              </Link>
            ))}
            {me && (
              <button type="button" className="mobile-signout" onClick={signOut}>
                <span>⎋</span>Sign out ({(me.name || me.email || '').split(' ')[0]}) <Icon name="arrow" />
              </button>
            )}
          </nav>
        </div>
      )}
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer section-gutter">
      <div className="footer-brand">
        <Link href="/" className="wordmark inverted">BOSS<span>MEDIA</span></Link>
        <p>Equestrian stories,<br />made to keep.</p>
        <div className="footer-social">
          <a href="https://instagram.com/bossmedia.nz" target="_blank" rel="noreferrer" aria-label="Boss Media on Instagram"><Icon name="instagram" size={18} /></a>
          <a href="https://www.facebook.com/BossMediaNZ/" target="_blank" rel="noreferrer" aria-label="Boss Media on Facebook"><Icon name="facebook" size={18} /></a>
        </div>
      </div>
      <div className="footer-links">
        <div>
          <p>Explore</p>
          <Link href="/events">Event galleries</Link>
          <Link href="/pre-book">Pre-book</Link>
          <Link href="/reels">Reels</Link>
        </div>
        <div>
          <p>Information</p>
          <Link href="/faq">Help &amp; delivery</Link>
          <Link href="/licensing">Licensing</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
        <div>
          <p>Contact</p>
          <a href="mailto:hello@bossmedia.nz">hello@bossmedia.nz</a>
          <Link href="/contact">Contact</Link>
          <Link href="/about">About</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <p>© 2026 Boss Media Limited</p>
        <p>Photographed in Aotearoa New Zealand</p>
      </div>
    </footer>
  );
}

export function EventCover({ eventId, alt }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/photos?event_id=${eventId}&limit=1`)
      .then((r) => r.json())
      .then((j) => { if (live) setSrc((j.data || [])[0]?.thumb_url || (j.data || [])[0]?.preview_url || null); })
      .catch(() => {});
    return () => { live = false; };
  }, [eventId]);
  if (!src) return <span className="cover-fallback" aria-hidden="true">Boss Media</span>;
  return <img src={src} alt={alt} loading="lazy" />;
}

export function EventCard({ item, view }) {
  const href = `/events/${item.slug}`;
  return (
    <article className="event-card">
      <Link href={href} className="event-image">
        {item.cover ? <img src={item.cover} alt={`${item.name} equestrian event`} loading="lazy" /> : <EventCover eventId={item.id} alt={`${item.name} equestrian event`} />}
      </Link>
      <div className="event-copy">
        <div className="event-status">
          <span className={item.live ? 'live' : ''} aria-hidden="true" />
          {item.status}
        </div>
        <h3><Link href={href}>{item.name}</Link></h3>
        <div className="event-data">
          <p>{item.dateLine}</p>
          <p>{item.location}</p>
        </div>
        <div className="event-action">
          <p>{item.countLine || 'Dedicated photo and reel coverage'}</p>
          <Link href={href}>{item.actionLabel} <Icon name="arrow" size={15} /></Link>
        </div>
      </div>
      {view === 'list' && (
        <Link className="list-arrow" href={href} aria-hidden="true" tabIndex={-1}>
          <Icon name="arrow" size={24} />
        </Link>
      )}
    </article>
  );
}
