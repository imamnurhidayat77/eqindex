import Link from 'next/link';
import './globals.css';
import Navbar, { NavSearch } from '../components/Navbar';
import RouteProgress from '../components/RouteProgress';
import { SeasonProvider } from '../components/global';
import { AuthProvider } from '../components/auth';
import UserMenu from '../components/UserMenu';

export const metadata = { title: 'EQIndex — Horse Intelligence' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Oswald:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink text-body text-sm min-h-screen flex flex-col">
        <RouteProgress />
        <SeasonProvider>
        <AuthProvider>
        <header className="flex justify-center bg-navbg border-b border-line sticky top-0 z-10">
          <div className="w-full max-w-shell mx-auto px-4 md:px-7 flex items-center gap-3 md:gap-5 h-[60px]">
            <Link href="/" className="font-extrabold text-lg text-white no-underline flex items-center gap-2 whitespace-nowrap">
              <span className="text-gold border-[1.5px] border-gold rounded-full w-[22px] h-[22px] inline-flex items-center justify-center text-xs">✕</span>
              <span className="font-extrabold"><b className="text-white font-extrabold">EQ</b><span className="text-gold font-extrabold">Index</span></span>
            </Link>
            <Navbar />
            <div className="flex-1" />
            <NavSearch />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 w-full max-w-shell mx-auto px-4 md:px-7 py-5 md:py-7">{children}</main>
        </AuthProvider>
        </SeasonProvider>
        <footer className="border-t border-rowline mt-12 flex justify-center">
          <div className="w-full max-w-shell mx-auto px-7 pt-[26px] pb-[30px] flex justify-between items-start gap-4 text-muted text-xs flex-wrap">
            <div>
              <div><b className="text-gold">EQIndex</b></div>
            </div>
            <div className="text-right">
              <nav className="flex gap-5 justify-end mb-2.5">
                <Link className="text-muted no-underline" href="/about">About</Link>
                <Link className="text-muted no-underline" href="/privacy">Privacy</Link>
                <Link className="text-muted no-underline" href="/terms">Terms</Link>
                <Link className="text-muted no-underline" href="/glossary">Glossary</Link>
                <Link className="text-muted no-underline" href="/contact">Contact</Link>
              </nav>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
