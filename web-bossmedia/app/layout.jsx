import './globals.css';
import RouteProgress from '../components/RouteProgress';
import { Toaster, ToastProvider } from '../components/Toaster';
import { SITE_URL } from '../lib/api';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Boss Media — Riders and Horses. Elevated.', template: '%s — Boss Media' },
  description: 'New Zealand equestrian photography: event galleries, single photos, reels and pre-booked coverage. Shot at shows across the country.',
  openGraph: {
    type: 'website',
    siteName: 'Boss Media',
    title: 'Boss Media — Riders and Horses. Elevated.',
    description: 'New Zealand equestrian photography: event galleries, single photos, reels and pre-booked coverage.',
  },
  twitter: { card: 'summary_large_image' },
};
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en-NZ">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
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
