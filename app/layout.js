import { Analytics } from '@vercel/analytics/react';
import ChatWrapper from './chat-wrapper';

export const metadata = {
  title: 'Full Throttle Utah | Premium Jet Ski & Powersport Rentals',
  description:
    'Premium Sea-Doo jet ski, UTV, and powersport rentals across every major Utah destination. Book online in 2 minutes. Pickup from Farmington, UT.',
  metadataBase: new URL('https://www.fullthrottleutah.com'),
  openGraph: {
    title: 'Full Throttle Utah | Premium Jet Ski & Powersport Rentals',
    description:
      'Premium Sea-Doo jet ski rentals across Utah. Pineview, Jordanelle, Deer Creek, Bear Lake, Lake Powell. Book online in 2 minutes.',
    url: 'https://www.fullthrottleutah.com',
    siteName: 'Full Throttle Utah',
    images: [{ url: '/images/icon-512.png', width: 512, height: 512, alt: 'Full Throttle Utah' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Full Throttle Utah | Premium Jet Ski Rentals',
    description: 'Premium Sea-Doo jet ski rentals across Utah. Pickup from Farmington.',
    images: ['/images/icon-512.png'],
  },
  icons: {
    icon: '/images/favicon.ico',
    shortcut: '/images/favicon.ico',
    apple: '/images/apple-icon.png',
  },
  manifest: '/images/manifest.json',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#0C4A6E',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/images/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/images/icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/images/icon-192.png" />
        <link rel="apple-touch-icon" href="/images/apple-icon.png" />
        <link rel="manifest" href="/images/manifest.json" />
      </head>
      <body style={{ margin: 0, padding: 0, WebkitTextSizeAdjust: '100%' }}>
        {children}
        <ChatWrapper />
        <Analytics />
      </body>
    </html>
  );
}
