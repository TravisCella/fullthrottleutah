export const metadata = {
  title: 'Full Throttle Utah | Premium Jet Ski & Powersport Rentals',
  description: 'Premium Sea-Doo jet ski, UTV, and powersport rentals across every major Utah destination. Book online in 2 minutes. Pickup from Farmington, UT.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
