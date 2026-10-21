import Link from 'next/link';
import Header from '../components/Header';

export const metadata = { title: 'Boss Media — Riders and Horses. Elevated.' };

export default function RootLayout({ children }) {
  return (
    <html lang="en-NZ">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Header />
        <main>{children}</main>
        <footer className="site-footer">
          <div className="inner">
            <div>
              <h4>Shop</h4>
              <Link href="/photos">All photos</Link>
              <Link href="/reels">Custom reels</Link>
              <Link href="/events">Events</Link>
            </div>
            <div>
              <h4>About</h4>
              <Link href="/about">About Boss Media</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/licensing">Licensing guide</Link>
              <Link href="/contact">Contact</Link>
            </div>
            <div>
              <h4>Legal</h4>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/refunds">Refunds</Link>
              <Link href="/takedown">Takedown</Link>
            </div>
          </div>
          <div className="fine">Prices in NZD, GST included. © Boss Media — New Zealand&apos;s Riders and Horses. Elevated.</div>
        </footer>
      </body>
    </html>
  );
}
