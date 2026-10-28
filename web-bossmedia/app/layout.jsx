import './globals.css';
import { Manrope } from 'next/font/google';
import RouteProgress from '../components/RouteProgress';
import { Toaster, ToastProvider } from '../components/Toaster';
import { SITE_URL } from '../lib/api';

// Self-hosted font (no render-blocking stylesheet links).
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-manrope' });

const OG_IMAGE = 'https://images.unsplash.com/photo-1594768816441-1dd241ffaa67?auto=format&fit=crop&w=1200&q=75';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Boss Media — Riders and Horses. Elevated.', template: '%s — Boss Media' },
  description: 'New Zealand equestrian photography: event galleries, single photos, reels and pre-booked coverage. Shot at shows across the country.',
  openGraph: {
    type: 'website',
    siteName: 'Boss Media',
    title: 'Boss Media — Riders and Horses. Elevated.',
    description: 'New Zealand equestrian photography: event galleries, single photos, reels and pre-booked coverage.',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Horse and rider at a New Zealand show' }],
  },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE] },
};
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en-NZ" className={manrope.variable}>
      <body>
        <ToastProvider>
          <RouteProgress />
          {children}
          <Toaster />
        </ToastProvider>
      </body>
    </html>
  );
}
