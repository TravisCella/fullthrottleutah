'use client'

export default function PrivacyPolicy() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F0F9FF 0%, #fff 100%)',
      fontFamily: "'Outfit', sans-serif",
      padding: '40px 24px',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <a href="/" style={{ color: '#0C4A6E', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Full Throttle Utah
        </a>

        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 36, fontWeight: 700, marginTop: 24, marginBottom: 8,
          color: '#0F172A', letterSpacing: '-0.03em',
        }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 32 }}>
          Last updated: May 18, 2026
        </p>

        <div style={{
          background: '#fff', borderRadius: 16, padding: 32,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          fontSize: 14, color: '#334155', lineHeight: 1.7,
        }}>
          <Section title="Introduction">
            TW Assets LLC d/b/a Full Throttle Utah (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates www.fullthrottleutah.com (the &quot;Site&quot;). This Privacy Policy explains how we collect, use, and protect your information when you use our personal watercraft rental services.
          </Section>

          <Section title="Information We Collect">
            <p>When you book a rental through our Site, we collect:</p>
            <ul>
              <li><strong>Contact information:</strong> name, email address, phone number</li>
              <li><strong>Rental details:</strong> selected dates, location, package type, experience level</li>
              <li><strong>Payment information:</strong> processed securely by Stripe; we do not store credit card numbers</li>
              <li><strong>Identification:</strong> driver&apos;s license information collected at pickup (not stored digitally)</li>
              <li><strong>Waiver acknowledgment:</strong> digital signature and timestamp for liability documentation</li>
            </ul>
          </Section>

          <Section title="How We Use Your Information">
            <p>We use your information to:</p>
            <ul>
              <li>Process your rental reservation and payment</li>
              <li>Send booking confirmations, reminders, and rental-related communications via email and SMS</li>
              <li>Coordinate pickup and return logistics</li>
              <li>Maintain liability documentation (waivers, photos at pickup/return)</li>
              <li>Comply with legal obligations including tax reporting and insurance claims</li>
            </ul>
          </Section>

          <Section title="SMS Communications">
            <p>By providing your phone number during booking, you consent to receive SMS notifications from Full Throttle Utah related to your reservation. These messages include:</p>
            <ul>
              <li>Booking confirmations</li>
              <li>Pre-rental reminders (typically 1-7 days before pickup)</li>
              <li>Day-of pickup reminders</li>
              <li>Return and refund status updates</li>
              <li>Service-related communications (e.g., schedule changes)</li>
            </ul>
            <p>Message and data rates may apply. Message frequency varies. Reply STOP to opt out of SMS messages at any time. Reply HELP for help, or call 801-548-1273.</p>
            <p>We do not send marketing or promotional SMS messages.</p>
          </Section>

          <Section title="Information Sharing">
            <p>We do not sell, rent, or trade your personal information. We share information only with:</p>
            <ul>
              <li><strong>Service providers</strong> who help operate our business (e.g., Stripe for payments, Twilio for SMS, Resend for email, Google for cloud storage)</li>
              <li><strong>Insurance providers</strong> in the event of a claim related to your rental</li>
              <li><strong>Legal authorities</strong> when required by law, subpoena, or to protect our rights</li>
            </ul>
          </Section>

          <Section title="Data Security">
            We implement reasonable safeguards to protect your information from unauthorized access. Payment information is processed by Stripe under PCI-DSS compliance. However, no system is 100% secure, and we cannot guarantee absolute security of data transmitted over the internet.
          </Section>

          <Section title="Data Retention">
            We retain booking records, waivers, and rental documentation for at least seven (7) years for tax, insurance, and liability purposes, consistent with Utah law and industry standards.
          </Section>

          <Section title="Your Rights">
            You may request access to, correction of, or deletion of your personal information by emailing us. Note that we may need to retain certain records (such as signed waivers and tax records) even after a deletion request, as required by law.
          </Section>

          <Section title="Children's Privacy">
            Our services are not directed to anyone under 18. We do not knowingly collect information from minors. Minors may operate rented watercraft only with parental consent in accordance with Utah law and our rental terms.
          </Section>

          <Section title="Changes to This Policy">
            We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date at the top reflects the most recent revision.
          </Section>

          <Section title="Contact Us">
            For privacy questions or requests, contact:<br/>
            <strong>Full Throttle Utah</strong> (TW Assets LLC)<br/>
            Farmington, UT<br/>
            Phone: 801-548-1273<br/>
            Email: via the website contact form
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: 17, fontWeight: 700,
        color: '#0F172A', marginTop: 0, marginBottom: 12,
      }}>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
