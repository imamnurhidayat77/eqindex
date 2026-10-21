import Link from 'next/link';
import './globals.css';

export const metadata = { title: 'Boss Media — Riders and Horses. Elevated.' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">BOSS MEDIA</Link>
          <nav>
            <Link href="/">Gallery</Link>
            <a href="https://eqindex.nz" className="muted">EQIndex ↗</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <span>© Boss Media — Riders and Horses. Elevated.</span>
        </footer>
      </body>
    </html>
  );
}
