// app/agreement/[bookingId]/sign/page.jsx
// Version: 2026-06-10 — Retroactive rental agreement signing page
// Created: June 10 2026
//
// PURPOSE:
// Lets customers sign the rental agreement AFTER booking. This handles
// pre-Phase-2 bookings (made before June 6 2026 when the in-flow agreement
// signing went live) and any future bookings where signing was skipped
// (e.g. phone bookings, manual entries).
//
// FLOW:
//   /agreement/{bookingId}/sign
//     ├─ Booking not found → 404-style message
//     ├─ Already signed → "already signed" confirmation + link to view-only
//     └─ Ready to sign → renders SignAgreementClient (interactive)
//
// SECURITY:
// The bookingId acts as the auth token. Anyone with the URL can sign for that
// booking. This matches the existing /agreement/[bookingId] view-only page
// — same trust model. Customers get the link from the owner via SMS/email.
// Search engines are blocked via the metadata noindex.

import { getBookingById } from '../../../../lib/sheets';
import { AGREEMENT_VERSION } from '../../../../lib/agreement-text';
import SignAgreementClient from './SignAgreementClient';

export const metadata = {
  title: 'Sign Rental Agreement — Full Throttle Utah',
  description: 'Sign your Full Throttle Utah rental agreement.',
  robots: 'noindex,nofollow',
};

// Force dynamic rendering — never cache. We need fresh booking data on every
// load (signature state may have changed since last visit).
export const dynamic = 'force-dynamic';

export default async function SignAgreementPage({ params }) {
  const { bookingId } = params;
  let booking;

  try {
    booking = await getBookingById(bookingId);
  } catch (err) {
    console.error('[sign-agreement-page] getBookingById failed:', err);
    return <ErrorState message="We couldn't look up your booking. Please call (801) 548-1273." />;
  }

  if (!booking) {
    return <NotFoundState bookingId={bookingId} />;
  }

  // Check if already signed. Phase 2 writes "YES" to column W when signed.
  const alreadySigned = String(booking.rental_agreement_signed || '')
    .toUpperCase()
    .startsWith('YES');

  if (alreadySigned) {
    return <AlreadySignedState booking={booking} />;
  }

  return <SignAgreementClient booking={booking} agreementVersion={AGREEMENT_VERSION} />;
}

// ─── State components ─────────────────────────────────────────────

function PageShell({ children }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0B1120',
        fontFamily: "'Outfit', system-ui, sans-serif",
        padding: '40px 20px',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap"
        rel="stylesheet"
      />
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function NotFoundState({ bookingId }) {
  return (
    <PageShell>
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 26,
          color: '#0F172A',
          margin: '0 0 12px',
        }}
      >
        Booking not found
      </h1>
      <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.6, margin: '0 0 20px' }}>
        We couldn't find a booking with the ID{' '}
        <code
          style={{
            background: '#F1F5F9',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {bookingId}
        </code>
        .
      </p>
      <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6 }}>
        If you believe this is an error, please contact us:
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
        <a href="tel:+18015481273" style={btn('#EA580C')}>
          📞 (801) 548-1273
        </a>
        <a href="mailto:bookings@fullthrottleutah.com" style={btn('#0C4A6E')}>
          ✉️ bookings@fullthrottleutah.com
        </a>
      </div>
    </PageShell>
  );
}

function AlreadySignedState({ booking }) {
  return (
    <PageShell>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: '#DCFCE7',
          color: '#166534',
          padding: '6px 14px',
          borderRadius: 999,
          fontSize: 13,
          fontWeight: 700,
          marginBottom: 16,
        }}
      >
        ✓ Agreement signed
      </div>
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 26,
          color: '#0F172A',
          margin: '0 0 12px',
        }}
      >
        You've already signed
      </h1>
      <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.6 }}>
        Thanks, {booking.renter_name?.split(' ')[0] || 'rider'}. Your rental agreement for the{' '}
        {booking.package} at {booking.location} on {formatDate(booking.start_date)} is signed and on
        file. You don't need to do anything else.
      </p>
      <a
        href={`/agreement/${booking.booking_id}`}
        style={{
          ...btn('#0C4A6E'),
          marginTop: 20,
        }}
      >
        View your signed agreement →
      </a>
    </PageShell>
  );
}

function ErrorState({ message }) {
  return (
    <PageShell>
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 26,
          color: '#0F172A',
          margin: '0 0 12px',
        }}
      >
        Something went wrong
      </h1>
      <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.6 }}>{message}</p>
    </PageShell>
  );
}

function formatDate(s) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

function btn(color) {
  return {
    background: color,
    color: '#fff',
    padding: '10px 18px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
  };
}
