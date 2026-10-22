import Link from 'next/link';
import Header from '../components/Header';
import './globals.css';
import './globals.css';

export const metadata = { title: 'Boss Media — Riders and Horses. Elevated.' };
export const viewport = { width: 'device-width', initialScale: 1 };

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
              <div className="brand" style={{ marginBottom: 10 }}>BOSS&nbsp;MEDIA</div>
              <p className="caption" style={{ fontSize: 13, maxWidth: 260 }}>
                Cinematic imagery and high-speed motion coverage dedicated to New Zealand equestrian sports.
              </p>
              <p className="caption" style={{ fontSize: 13 }}>Prices displayed in New Zealand Dollars (NZD).</p>
            </div>
            <div>
              <h4>Explore</h4>
              <Link href="/events">Calendar</Link>
              <Link href="/photos">Photos</Link>
              <Link href="/reels">Showreels</Link>
            </div>
            <div>
              <h4>Company</h4>
              <Link href="/about">About</Link>
              <Link href="/licensing">Licensing Guide</Link>
              <Link href="/contact">Contact</Link>
            </div>
            <div>
              <h4>Legal</h4>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/takedown">Takedown Request</Link>
            </div>
          </div>
          <div className="fine">© 2026 Boss Media Limited. All rights reserved. · Secure checkout · Watermark-free downloads · Photographer rights protected</div>
        </footer>
      </body>
    </html>
  );
}
