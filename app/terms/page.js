// app/terms/page.js
// Version: 2026-06-09 Phase 4 v2 — SMS section matched to Twilio A2P 10DLC approval
// Last edited: June 9 2026
//
// This page governs use of the website (fullthrottleutah.com). Distinct from:
//   - Rental Agreement (signed at booking) — governs the rental transaction itself
//   - Liability Waiver (signed at booking) — assumption of risk / release
//   - Privacy Policy — data collection and SMS practices
//
// v2 update: Section 3 (SMS) now matches the exact language submitted to and
// approved by The Campaign Registry (TCR) via Twilio. Campaign SID:
// CMdf1d3daf96402c9d42d8a1c4bb7373f0. Categories, opt-in mechanism, and STOP
// keyword all preserved verbatim from the Twilio campaign description.

export const metadata = {
  title: 'Terms of Use — Full Throttle Utah',
  description: 'Terms of use governing the Full Throttle Utah website (fullthrottleutah.com).',
};

export default function TermsOfUse() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0B1120',
        fontFamily: "'Outfit', system-ui, sans-serif",
        color: '#0F172A',
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div
        style={{
          background: '#0B1120',
          color: '#fff',
          padding: '32px 24px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <a
            href="/"
            style={{
              color: '#FB923C',
              fontSize: 13,
              textDecoration: 'none',
              fontWeight: 600,
              display: 'inline-block',
              marginBottom: 16,
            }}
          >
            ← Back to fullthrottleutah.com
          </a>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 32,
              fontWeight: 700,
              color: '#fff',
              margin: '0 0 8px',
              letterSpacing: '-0.01em',
            }}
          >
            Terms of Use
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
            Effective for website use · Last updated June 2026
          </p>
        </div>
      </div>

      {/* Important relationship card */}
      <div
        style={{
          maxWidth: 720,
          margin: '16px auto 0',
          padding: '0 20px',
        }}
      >
        <div
          style={{
            background: '#0F172A',
            borderRadius: 14,
            padding: 20,
            marginBottom: 16,
            color: '#fff',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#FB923C',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 10,
            }}
          >
            Important
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#E2E8F0', margin: '0 0 10px' }}>
            These Terms of Use govern your use of <strong>fullthrottleutah.com</strong>. They do{' '}
            <em>not</em> govern the terms of an actual rental.
          </p>
          <p style={{ fontSize: 13, color: '#CBD5E1', margin: 0 }}>
            When you book a rental, you separately sign two additional documents — the{' '}
            <strong style={{ color: '#fff' }}>Liability Waiver</strong> and the{' '}
            <strong style={{ color: '#fff' }}>Rental Agreement</strong> — which govern the rental
            transaction itself.
          </p>
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '0 20px 60px',
        }}
      >
        {/* Section 1 */}
        <Card>
          <SectionHeading>1. Acceptance of Terms</SectionHeading>
          <p style={paraStyle}>
            By accessing or using fullthrottleutah.com (the "Site"), you agree to be bound by these
            Terms of Use. If you do not agree, do not use the Site.
          </p>
          <p style={paraStyle}>
            We may update these Terms from time to time. Continued use of the Site after changes
            means you accept the updated Terms.
          </p>
        </Card>

        {/* Section 2 */}
        <Card>
          <SectionHeading>2. Bookings and the Rental Agreement</SectionHeading>
          <p style={paraStyle}>
            When you complete a booking on this Site, you separately sign two documents in addition
            to these Terms:
          </p>
          <ul style={listStyle}>
            <li>
              <strong>Liability Waiver</strong> — covers assumption of risk and release of claims
              for personal injury
            </li>
            <li>
              <strong>Rental Agreement</strong> — covers the rental transaction (payment, deposit,
              damage, fuel, late return, cancellation, equipment use)
            </li>
          </ul>
          <p style={paraStyle}>
            The Rental Agreement is the controlling document for your rental. If anything on this
            Site conflicts with the signed Rental Agreement, the Rental Agreement governs.
          </p>
          <p style={paraStyle}>
            You can review your signed Rental Agreement at any time at{' '}
            <code style={codeStyle}>fullthrottleutah.com/agreement/[your-booking-id]</code> (the
            booking ID is included in your confirmation email).
          </p>
        </Card>

        {/* Section 3: SMS */}
        <Card>
          <SectionHeading>3. SMS Communications</SectionHeading>
          <p style={paraStyle}>
            When you book a rental on this Site, you may opt in to receive transactional SMS
            notifications from Full Throttle Utah (TW Assets LLC) at the phone number you provide.
            Customers explicitly opt in to receive SMS during the booking process at
            fullthrottleutah.com.
          </p>
          <p style={paraStyle}>
            <strong>Message types include:</strong>
          </p>
          <ul style={listStyle}>
            <li>
              <strong>Booking confirmations</strong> — sent immediately after a booking is completed
            </li>
            <li>
              <strong>Pickup and return reminders</strong> — typically the day before pickup and the
              day of return
            </li>
            <li>
              <strong>Post-rental follow-ups</strong> — deposit refund confirmations and review
              requests
            </li>
            <li>
              <strong>Reservation updates</strong> — if changes to your booking become necessary
            </li>
          </ul>
          <p style={paraStyle}>
            <strong>Frequency:</strong> Message frequency varies by booking but is typically 3-5
            messages per rental.
          </p>
          <p style={paraStyle}>
            <strong>Charges:</strong> Message and data rates may apply per your mobile carrier's
            plan. Carriers are not liable for delayed or undelivered messages.
          </p>
          <p style={paraStyle}>
            <strong>Opt-out:</strong> Reply <strong>STOP</strong> to any message at any time to
            immediately stop receiving SMS from us. Reply <strong>HELP</strong> for assistance.
          </p>
          <p style={paraStyle}>
            <strong>Consent is not required to book a rental.</strong> SMS opt-in is optional. If
            you do not opt in, you will receive booking confirmations and reminders via email only.
          </p>
        </Card>

        {/* Section 4: Acceptable Use */}
        <Card>
          <SectionHeading>4. Acceptable Use</SectionHeading>
          <p style={paraStyle}>You agree not to:</p>
          <ul style={listStyle}>
            <li>Use the Site to make fraudulent bookings or submit false information</li>
            <li>Attempt to access non-public areas of the Site or interfere with its operation</li>
            <li>
              Use automated systems (bots, scrapers) to access the Site without our written
              permission
            </li>
            <li>Use the Site in violation of any applicable law</li>
          </ul>
        </Card>

        {/* Section 5: Intellectual Property */}
        <Card>
          <SectionHeading>5. Intellectual Property</SectionHeading>
          <p style={paraStyle}>
            All content on this Site — including the Full Throttle Utah name, logo, photographs,
            text, and design — is owned by TW Assets LLC or its licensors. You may not reproduce,
            distribute, or use any of it commercially without our written permission.
          </p>
          <p style={paraStyle}>
            You may take screenshots for personal use (e.g., to share a booking confirmation with
            your group).
          </p>
        </Card>

        {/* Section 6: Disclaimer */}
        <Card>
          <SectionHeading>6. Disclaimer of Warranties</SectionHeading>
          <p style={paraStyle}>
            The Site is provided "as is" without warranties of any kind, either express or implied.
            We do not warrant that the Site will be uninterrupted, error-free, or free of viruses or
            other harmful components.
          </p>
          <p style={paraStyle}>
            Pricing, availability, and equipment information displayed on the Site is for reference
            and may change. Your booking is confirmed only after payment is received and you receive
            a confirmation email.
          </p>
        </Card>

        {/* Section 7: Limitation */}
        <Card>
          <SectionHeading>7. Limitation of Liability (Website)</SectionHeading>
          <p style={paraStyle}>
            To the maximum extent permitted by Utah law, TW Assets LLC is not liable for any
            indirect, incidental, consequential, or punitive damages arising from your use of{' '}
            <em>the Site</em>.
          </p>
          <p style={paraStyle}>
            For liability related to rentals themselves — including injury, equipment damage, and
            other rental-related claims — see the Liability Waiver and Rental Agreement.
          </p>
        </Card>

        {/* Section 8: Privacy */}
        <Card>
          <SectionHeading>8. Privacy</SectionHeading>
          <p style={paraStyle}>
            Our practices for collecting, using, and protecting your personal information are
            described in our{' '}
            <a href="/privacy-policy" style={{ color: '#0C4A6E', fontWeight: 600 }}>
              Privacy Policy
            </a>
            , which is incorporated into these Terms by reference.
          </p>
        </Card>

        {/* Section 9: Governing Law */}
        <Card>
          <SectionHeading>9. Governing Law and Venue</SectionHeading>
          <p style={paraStyle}>
            These Terms are governed by the laws of the State of Utah without regard to its
            conflicts of law principles. Any dispute arising from these Terms shall be resolved in
            the state or federal courts located in <strong>Davis County, Utah</strong>, and you
            consent to the personal jurisdiction of those courts.
          </p>
        </Card>

        {/* Section 10: Severability */}
        <Card>
          <SectionHeading>10. Severability</SectionHeading>
          <p style={paraStyle}>
            If any provision of these Terms is found unenforceable, the remaining provisions remain
            in full force and effect.
          </p>
        </Card>

        {/* Section 11: Contact */}
        <Card>
          <SectionHeading>11. Contact</SectionHeading>
          <p style={paraStyle}>Questions about these Terms?</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <a href="tel:+18015481273" style={contactBtnStyle('#EA580C')}>
              📞 (801) 548-1273
            </a>
            <a href="mailto:bookings@fullthrottleutah.com" style={contactBtnStyle('#0C4A6E')}>
              ✉️ bookings@fullthrottleutah.com
            </a>
          </div>
        </Card>

        {/* Footer */}
        <div
          style={{
            textAlign: 'center',
            padding: '20px 0',
            fontSize: 12,
            color: '#94A3B8',
          }}
        >
          Full Throttle Utah · TW Assets LLC · Farmington, UT
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────

const paraStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  color: '#475569',
  margin: '0 0 12px',
};

const listStyle = {
  fontSize: 14,
  lineHeight: 1.7,
  color: '#475569',
  paddingLeft: 22,
  margin: '0 0 12px',
};

const codeStyle = {
  background: '#F1F5F9',
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'monospace',
  color: '#0F172A',
};

function Card({ children }) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: 24,
        marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      {children}
    </div>
  );
}

function SectionHeading({ children }) {
  return (
    <h2
      style={{
        fontSize: 13,
        fontWeight: 800,
        color: '#0C4A6E',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginTop: 0,
        marginBottom: 12,
        paddingBottom: 6,
        borderBottom: '1px solid #F1F5F9',
      }}
    >
      {children}
    </h2>
  );
}

function contactBtnStyle(color) {
  return {
    background: color,
    color: '#fff',
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    display: 'inline-block',
  };
}
