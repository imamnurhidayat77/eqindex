import './globals.css';
import Navbar, { NavSearch, NavSeason } from '../components/Navbar';
import { SeasonProvider } from '../components/global';
import { AuthProvider } from '../components/auth';
import UserMenu from '../components/UserMenu';

export const metadata = { title: 'EQIndex — Horse Intelligence' };

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
        <SeasonProvider>
        <AuthProvider>
        <header className="flex justify-center bg-navbg border-b border-line sticky top-0 z-10">
          <div className="w-full max-w-shell mx-auto px-4 md:px-7 flex items-center gap-3 md:gap-5 h-[60px]">
            <a href="/" className="font-extrabold text-lg text-white no-underline flex items-center gap-2 whitespace-nowrap">
              <span className="text-gold border-[1.5px] border-gold rounded-full w-[22px] h-[22px] inline-flex items-center justify-center text-xs">✕</span>
              <span className="font-extrabold"><b className="text-white font-extrabold">EQ</b><span className="text-gold font-extrabold">Index</span></span>
            </a>
            <Navbar />
            <div className="flex-1" />
            <NavSearch />
            <NavSeason />
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
              <div>The elite horse intelligence platform. Connecting data, horses, and riders.</div>
              <div className="mt-2">© 2026 EQIndex Platforms Ltd. All rights reserved.</div>
            </div>
            <div className="text-right">
              <nav className="flex gap-5 justify-end mb-2.5">
                <a className="text-muted no-underline" href="/about">About</a>
                <a className="text-muted no-underline" href="/api-docs">API</a>
                <a className="text-muted no-underline" href="/privacy">Privacy</a>
                <a className="text-muted no-underline" href="/terms">Terms</a>
                <a className="text-muted no-underline" href="/contact">Contact</a>
              </nav>
              <div className="mt-2">Bloomberg Terminal x Showjumping New Zealand Circuit</div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
