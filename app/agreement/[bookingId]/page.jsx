// app/agreement/[bookingId]/page.jsx
// Version: 2026-06-06 Phase 3 — Customer-facing signed agreement view
// Last edited: June 6 2026
//
// Renders the customer's signed rental agreement at a stable URL so they
// can revisit it any time:
//   https://fullthrottleutah.com/agreement/cs_live_a1cXcrXXX
//
// This URL is included in the customer confirmation email (Phase 4 will
// add the explicit link). Anyone with the URL can view — booking IDs are
// long, opaque Stripe Checkout Session IDs so they function as soft secrets.
//
// SERVER COMPONENT: fetches directly from Google Sheets via getBookingById,
// no API route needed, no client-side credentials. The metadata export adds
// noindex so search engines don't crawl these private pages.
//
// THREE STATES:
//   1. Agreement found     → render the full agreement
//   2. Booking not found   → "Agreement not found" view with contact info
//   3. Booking pre-Phase-2 → "No agreement on file" view (older bookings
//                            won't have rental_agreement_signed=YES)
//
// MULTI-VERSION HANDLING: For now, we display the current AGREEMENT_VERSION
// text regardless of what the booking signed (v1.0.0 is the only version).
// When v2.0.0+ exists, we'll need to import historical versions and switch
// based on booking.rental_agreement_version.

import { getBookingById } from '../../../lib/sheets';
import {
  AGREEMENT_VERSION,
  AGREEMENT_PREAMBLE,
  AGREEMENT_SECTIONS,
  AGREEMENT_CHECKBOXES,
  AGREEMENT_APPENDIX,
} from '../../../lib/agreement-text';
import PrintButton from './PrintButton';

export const metadata = {
  title: 'Rental Agreement — Full Throttle Utah',
  robots: { index: false, follow: false }, // private page, don't index
};

export default async function AgreementPage({ params }) {
  const { bookingId } = params;

  // ─── Fetch booking ────────────────────────────────────────────────────
  let booking = null;
  let error = null;
  try {
    booking = await getBookingById(bookingId);
  } catch (err) {
    console.error('[/agreement] Error fetching booking:', err);
    error = err.message || 'Failed to load booking';
  }

  // ─── State 1: Booking not found ───────────────────────────────────────
  if (!booking) {
    return <NotFoundView bookingId={bookingId} error={error} />;
  }

  // ─── State 2: Booking exists but agreement not signed (pre-Phase-2) ───
  if (!booking.rental_agreement_signed) {
    return <NotSignedView booking={booking} />;
  }

  // ─── State 3: Agreement found, render full ─────────────────────────────
  return <AgreementView booking={booking} />;
}

// ════════════════════════════════════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════════════════════════════════════

function AgreementView({ booking }) {
  // Format the signed date for display
  const signedDate = booking.rental_agreement_signed_at
    ? new Date(booking.rental_agreement_signed_at).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : 'On file';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f3ee',
        fontFamily: "'Outfit', system-ui, sans-serif",
        color: '#0F172A',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap"
        rel="stylesheet"
      />

      {/* ─── Print-only style: clean layout when customer prints/saves PDF */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .printable {
            background: #fff !important;
            box-shadow: none !important;
            margin: 0 !important;
            max-width: none !important;
          }
        }
      `}</style>

      {/* Header */}
      <div
        className="no-print"
        style={{
          background: '#0B1120',
          color: '#fff',
          padding: '18px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 800,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
              🌊 Full Throttle Utah
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
              Your signed rental agreement
            </div>
          </div>
          <PrintButton />
        </div>
      </div>

      {/* Body */}
      <div
        className="printable"
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '24px 20px 60px',
        }}
      >
        {/* ─── Signing badge ──────────────────────────────────────────── */}
        <div
          style={{
            background: '#fff',
            border: '2px solid #16A34A',
            borderRadius: 14,
            padding: 20,
            marginBottom: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: 28 }}>✅</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#14532D' }}>
                Agreement signed
              </div>
              <div style={{ fontSize: 12, color: '#166534' }}>
                Version {booking.rental_agreement_version || AGREEMENT_VERSION} · Booking{' '}
                {(booking.booking_id || '').slice(-8)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            <Field label="Signed By" value={booking.renter_name} />
            <Field label="Email" value={booking.renter_email} />
            <Field label="Signed On" value={signedDate} />
            <Field label="Rental Package" value={booking.package} />
            <Field label="Lake" value={booking.location} />
            <Field
              label="Rental Dates"
              value={
                booking.end_date && booking.end_date !== booking.start_date
                  ? `${booking.start_date} → ${booking.end_date}`
                  : booking.start_date
              }
            />
          </div>
        </div>

        {/* ─── Full agreement document ─────────────────────────────────── */}
        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            padding: '32px 28px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          {/* Title */}
          <div
            style={{
              textAlign: 'center',
              borderBottom: '2px solid #0C4A6E',
              paddingBottom: 16,
              marginBottom: 24,
            }}
          >
            <h1
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 24,
                fontWeight: 700,
                color: '#0F172A',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {AGREEMENT_PREAMBLE.title}
            </h1>
            <div
              style={{
                fontSize: 11,
                color: '#94A3B8',
                marginTop: 8,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Version {booking.rental_agreement_version || AGREEMENT_VERSION}
            </div>
          </div>

          {/* About */}
          <div style={{ marginBottom: 24 }}>
            <SectionHeading>About This Agreement</SectionHeading>
            {AGREEMENT_PREAMBLE.about.map((p, i) => (
              <p key={i} style={{ margin: '0 0 12px', color: '#475569' }}>
                {p}
              </p>
            ))}
          </div>

          {/* All 13 sections */}
          {AGREEMENT_SECTIONS.map((section) => (
            <div key={section.number} style={{ marginBottom: 26, pageBreakInside: 'avoid' }}>
              <SectionHeading>
                Section {section.number} — {section.title}
              </SectionHeading>
              {section.intro && (
                <p style={{ margin: '0 0 12px', color: '#475569' }}>{section.intro}</p>
              )}
              {section.clauses.map((clause) => (
                <div key={clause.id} style={{ marginBottom: 14 }}>
                  <div style={{ color: '#475569' }}>
                    <span style={{ fontWeight: 700, color: '#0F172A', marginRight: 6 }}>
                      {clause.id}
                    </span>
                    {clause.text}
                  </div>
                  {clause.bullets && (
                    <ul style={{ margin: '8px 0 0 24px', padding: 0, color: '#475569' }}>
                      {clause.bullets.map((b, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                  {clause.footer && (
                    <div
                      style={{ marginTop: 8, fontStyle: 'italic', color: '#64748B', fontSize: 13 }}
                    >
                      {clause.footer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* Acknowledgments section — show what they checked */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 24,
              borderTop: '2px solid #E2E8F0',
              pageBreakInside: 'avoid',
            }}
          >
            <SectionHeading>Acknowledgments</SectionHeading>
            <p style={{ margin: '0 0 12px', color: '#475569', fontSize: 13 }}>
              By signing this Agreement, the Renter acknowledged the following:
            </p>
            {AGREEMENT_CHECKBOXES.map((cb) => (
              <div
                key={cb.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '8px 0',
                  fontSize: 13,
                  color: '#475569',
                }}
              >
                <span style={{ color: '#16A34A', fontSize: 16, lineHeight: 1, marginTop: 2 }}>
                  ✓
                </span>
                <span>{cb.label}</span>
              </div>
            ))}
          </div>

          {/* Signature record */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 20,
              borderTop: '2px solid #E2E8F0',
              background: '#F8FAFC',
              padding: 20,
              borderRadius: 12,
              pageBreakInside: 'avoid',
            }}
          >
            <SectionHeading>Signature Record</SectionHeading>
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
              <div>
                <strong style={{ color: '#0F172A' }}>Renter:</strong> {booking.renter_name}
              </div>
              <div>
                <strong style={{ color: '#0F172A' }}>Email:</strong> {booking.renter_email}
              </div>
              <div>
                <strong style={{ color: '#0F172A' }}>Phone:</strong> {booking.renter_phone}
              </div>
              <div>
                <strong style={{ color: '#0F172A' }}>Signed On:</strong> {signedDate}
              </div>
              <div>
                <strong style={{ color: '#0F172A' }}>Agreement Version:</strong>{' '}
                {booking.rental_agreement_version || AGREEMENT_VERSION}
              </div>
              <div>
                <strong style={{ color: '#0F172A' }}>Booking Reference:</strong>{' '}
                {booking.booking_id}
              </div>
            </div>
          </div>

          {/* Appendix */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid #E2E8F0',
              pageBreakInside: 'avoid',
            }}
          >
            <SectionHeading>{AGREEMENT_APPENDIX.title}</SectionHeading>
            <p style={{ margin: '0 0 8px', color: '#475569' }}>{AGREEMENT_APPENDIX.intro}</p>
            <ul style={{ margin: '8px 0 12px 24px', padding: 0, color: '#475569' }}>
              {AGREEMENT_APPENDIX.references.map((r, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {r}
                </li>
              ))}
            </ul>
            <p style={{ margin: '12px 0 0', fontStyle: 'italic', color: '#64748B', fontSize: 13 }}>
              {AGREEMENT_APPENDIX.conflict}
            </p>
          </div>
        </div>

        {/* Footer / contact */}
        <div
          className="no-print"
          style={{
            marginTop: 24,
            padding: 20,
            background: '#0F172A',
            color: '#fff',
            borderRadius: 14,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, color: '#CBD5E1', marginBottom: 4 }}>
            Questions about this agreement?
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            Travis ·{' '}
            <a href="tel:+18015481273" style={{ color: '#FB923C', textDecoration: 'none' }}>
              (801) 548-1273
            </a>
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>
            Or email{' '}
            <a
              href="mailto:bookings@fullthrottleutah.com"
              style={{ color: '#FB923C', textDecoration: 'none' }}
            >
              bookings@fullthrottleutah.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════

function NotFoundView({ bookingId, error }) {
  return (
    <StatusView
      emoji="🔍"
      title="Agreement not found"
      subtitle="We couldn't find a booking matching this reference."
      message={
        error
          ? `Error: ${error}. Please contact us so we can help look this up.`
          : `Double-check the link in your confirmation email, or contact us and we'll send a fresh copy.`
      }
      bookingIdSnippet={bookingId}
    />
  );
}

function NotSignedView({ booking }) {
  return (
    <StatusView
      emoji="📋"
      title="No signed agreement on file"
      subtitle="This booking predates our digital rental agreement system."
      message={`Your booking for ${booking.package} on ${booking.start_date} is confirmed in our system, but it was made before we introduced the digital rental agreement. Contact us if you need a copy of the agreement terms that applied to your rental.`}
      bookingIdSnippet={booking.booking_id}
    />
  );
}

function StatusView({ emoji, title, subtitle, message, bookingIdSnippet }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0B1120',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '40px 28px 32px',
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 16 }}>{emoji}</div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 8,
            color: '#0F172A',
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: 14,
            color: '#64748B',
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
        <p
          style={{
            fontSize: 14,
            color: '#475569',
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          {message}
        </p>
        <div
          style={{
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: 10,
            padding: 14,
            fontSize: 12,
            color: '#0C4A6E',
            marginBottom: 16,
          }}
        >
          Contact Travis at{' '}
          <a
            href="tel:+18015481273"
            style={{ color: '#EA580C', textDecoration: 'none', fontWeight: 600 }}
          >
            (801) 548-1273
          </a>{' '}
          or{' '}
          <a
            href="mailto:bookings@fullthrottleutah.com"
            style={{ color: '#EA580C', textDecoration: 'none', fontWeight: 600 }}
          >
            bookings@fullthrottleutah.com
          </a>
        </div>
        {bookingIdSnippet && (
          <div
            style={{
              fontSize: 10,
              color: '#94A3B8',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
          >
            Ref: {bookingIdSnippet}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Small helpers
// ════════════════════════════════════════════════════════════════════════

function Field({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#64748B',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{value || '—'}</div>
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 800,
        color: '#0C4A6E',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 12,
        paddingBottom: 6,
        borderBottom: '1px solid #F1F5F9',
      }}
    >
      {children}
    </div>
  );
}
