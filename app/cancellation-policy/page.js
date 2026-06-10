// app/cancellation-policy/page.js
// Version: 2026-06-09 Phase 4 — Aligned with Rental Agreement v1.0.0 Section 3
// Last edited: June 9 2026
//
// This page is the public-facing version of the cancellation policy. It must
// stay consistent with Section 3 of the Rental Agreement (lib/agreement-text.js):
//   - 3.2 cancellation tiers (>7d: full refund minus $50; 3-7d: 50%; <3d: no refund)
//   - 3.3 weather cancellation options (credit OR refund, white-glove fees retained)
//   - 3.4 customer-initiated weather cancellations follow standard tiers
//
// If the Rental Agreement values ever change, update them here too. The
// Agreement governs in case of conflict (Section 12.6), but this page is
// usually what customers see first.

export const metadata = {
  title: 'Cancellation & Weather Policy — Full Throttle Utah',
  description: 'Cancellation tiers, weather provisions, and refund processing for Full Throttle Utah jet ski rentals.',
};

export default function CancellationPolicy() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0B1120',
      fontFamily: "'Outfit', system-ui, sans-serif",
      color: '#0F172A',
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div style={{
        background: '#0B1120',
        color: '#fff',
        padding: '32px 24px 24px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <a href="/" style={{
            color: '#FB923C',
            fontSize: 13,
            textDecoration: 'none',
            fontWeight: 600,
            display: 'inline-block',
            marginBottom: 16,
          }}>
            ← Back to fullthrottleutah.com
          </a>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 32,
            fontWeight: 700,
            color: '#fff',
            margin: '0 0 8px',
            letterSpacing: '-0.01em',
          }}>
            Cancellation & Weather Policy
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
            Effective for all bookings · Last updated June 2026
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '0 20px 60px',
      }}>

        {/* Intro */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: 24,
          marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#475569', margin: 0 }}>
            We understand plans change. This page explains our cancellation tiers and what happens when weather forces a change. These terms are also incorporated into the Rental Agreement that all customers sign at booking.
          </p>
        </div>

        {/* Standard cancellation tiers */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: 24,
          marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <SectionHeading>1. Standard Cancellation Tiers</SectionHeading>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569', marginTop: 0 }}>
            All cancellations are processed based on how far in advance you notify us before your rental start date:
          </p>

          <TierCard
            window="More than 7 days before rental"
            refund="Full refund minus a $50 processing fee"
            color="#16A34A"
            bg="#F0FDF4"
            border="#BBF7D0"
          />
          <TierCard
            window="3 to 7 days before rental"
            refund="50% refund"
            color="#D97706"
            bg="#FEF3C7"
            border="#FCD34D"
          />
          <TierCard
            window="Less than 3 days before rental"
            refund="No refund. Full booking forfeit."
            color="#DC2626"
            bg="#FEE2E2"
            border="#FCA5A5"
          />
          <TierCard
            window="No-show on rental day"
            refund="No refund. Full booking forfeit."
            color="#DC2626"
            bg="#FEE2E2"
            border="#FCA5A5"
          />
        </div>

        {/* Weather cancellations */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: 24,
          marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <SectionHeading>2. Weather Cancellations</SectionHeading>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 16, marginBottom: 8 }}>
            When Full Throttle Utah cancels
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
            If we determine conditions are unsafe — high winds, lightning, dangerous water — we'll proactively reach out and offer you a choice:
          </p>
          <ul style={{ fontSize: 14, lineHeight: 1.6, color: '#475569', paddingLeft: 22, marginBottom: 12 }}>
            <li><strong>Full credit</strong> toward a future booking within the same rental season, OR</li>
            <li><strong>Full refund</strong> of your rental fee (white-glove delivery fees are retained if delivery has already occurred)</li>
          </ul>

          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 20, marginBottom: 8 }}>
            When the customer cancels for weather
          </h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
            If you choose to cancel based on weather concerns but we have not determined conditions to be unsafe, the standard cancellation tiers above apply. We monitor conditions actively and will reach out as soon as a real safety concern emerges.
          </p>

          <div style={{
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: 10,
            padding: 14,
            marginTop: 16,
            fontSize: 13,
            color: '#0C4A6E',
            lineHeight: 1.5,
          }}>
            <strong>Our safety threshold:</strong> sustained winds &gt; 25 mph, lightning within 10 miles, or active hazardous water advisories from Utah State Parks or the National Weather Service.
          </div>
        </div>

        {/* How to cancel */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: 24,
          marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <SectionHeading>3. How to Cancel</SectionHeading>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
            Contact us as early as possible. The sooner you reach out, the better refund tier you'll qualify for under the schedule above.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <a href="tel:+18015481273" style={contactBtnStyle('#EA580C')}>
              📞 (801) 548-1273
            </a>
            <a href="mailto:bookings@fullthrottleutah.com" style={contactBtnStyle('#0C4A6E')}>
              ✉️ bookings@fullthrottleutah.com
            </a>
          </div>
        </div>

        {/* Refund processing */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: 24,
          marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <SectionHeading>4. Refund Processing</SectionHeading>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
            Approved refunds are processed within 7 business days of cancellation. The funds typically appear on your statement 5-10 business days after processing, depending on your bank or card issuer.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
            Refunds are issued to the original payment method only. Credits toward future bookings remain available throughout the current rental season (April 15 – October 15).
          </p>
        </div>

        {/* Modifications */}
        <div style={{
          background: '#fff',
          borderRadius: 14,
          padding: 24,
          marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <SectionHeading>5. Modifications (Date Changes)</SectionHeading>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#475569' }}>
            We treat date changes the same as cancellations under the standard tiers. If you change your rental date with more than 7 days' notice, we'll move your booking with no fee. Inside 7 days, modifications follow the same refund schedule as cancellations.
          </p>
        </div>

        {/* Relationship to Rental Agreement */}
        <div style={{
          background: '#0F172A',
          borderRadius: 14,
          padding: 24,
          marginBottom: 16,
          color: '#fff',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Related Documents
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#CBD5E1', margin: '0 0 12px' }}>
            This policy is incorporated into the Rental Agreement you sign at booking (Section 3). The Rental Agreement governs in case of any conflict between this page and the signed agreement.
          </p>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
            See also: <a href="/terms" style={{ color: '#FB923C' }}>Terms of Use</a> · <a href="/privacy-policy" style={{ color: '#FB923C' }}>Privacy Policy</a>
          </p>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          padding: '20px 0',
          fontSize: 12,
          color: '#94A3B8',
        }}>
          Full Throttle Utah · TW Assets LLC · Farmington, UT
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────

function SectionHeading({ children }) {
  return (
    <h2 style={{
      fontSize: 13,
      fontWeight: 800,
      color: '#0C4A6E',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginTop: 0,
      marginBottom: 12,
      paddingBottom: 6,
      borderBottom: '1px solid #F1F5F9',
    }}>
      {children}
    </h2>
  );
}

function TierCard({ window, refund, color, bg, border }) {
  return (
    <div style={{
      background: bg,
      border: `1.5px solid ${border}`,
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
        {window}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>
        {refund}
      </div>
    </div>
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
