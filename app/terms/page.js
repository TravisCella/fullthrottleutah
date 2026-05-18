'use client'

export default function Terms() {
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
          Terms and Conditions
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
          <Section title="1. Agreement to Terms">
            These Terms and Conditions govern your use of www.fullthrottleutah.com and your rental of personal watercraft and equipment from TW Assets LLC d/b/a Full Throttle Utah (&quot;Full Throttle Utah,&quot; &quot;we,&quot; or &quot;us&quot;). By booking a rental, you agree to be bound by these Terms, our Privacy Policy, and the Liability Waiver signed at the time of booking.
          </Section>

          <Section title="2. Eligibility">
            <ul>
              <li>Renter must be at least 18 years old to book and pay for a rental.</li>
              <li>Renter must possess a valid driver&apos;s license at pickup.</li>
              <li>Operator(s) must be at least 16 years old as required by Utah Code § 73-18-15.1.</li>
              <li>Operators born after December 31, 1985 must have completed a Utah-approved boating safety course.</li>
            </ul>
          </Section>

          <Section title="3. Rental Process">
            <ul>
              <li><strong>Booking:</strong> A 50% deposit is collected at the time of online booking via Stripe.</li>
              <li><strong>Pickup:</strong> Rentals are picked up at our Farmington, UT location at 8:00 AM on the rental date unless other arrangements are made.</li>
              <li><strong>Remaining balance:</strong> The remaining balance, plus a $1,000 refundable security deposit per package, is due at pickup.</li>
              <li><strong>Return:</strong> Equipment must be returned by 8:00 PM on the final rental date, fully refueled, with all included accessories.</li>
              <li><strong>Towing:</strong> Renter is responsible for transporting the equipment with a vehicle equipped with a 2&quot; ball hitch and flat 4-prong light hookup.</li>
            </ul>
          </Section>

          <Section title="4. Security Deposit & Damage">
            <ul>
              <li>The $1,000 security deposit is refundable within 2 business days after return, subject to inspection.</li>
              <li>Any damage, missing equipment, late return fees, or fuel charges will be deducted from the deposit.</li>
              <li>Damage exceeding the deposit amount is the renter&apos;s responsibility, payable within 14 days of notification.</li>
              <li>Renter is responsible for all damage occurring while the equipment is in their care, custody, or control, including during transport.</li>
            </ul>
          </Section>

          <Section title="5. Cancellation & Refund Policy">
            <ul>
              <li><strong>72+ hours before rental:</strong> Full refund of deposit.</li>
              <li><strong>48-72 hours before rental:</strong> 50% refund of deposit.</li>
              <li><strong>Less than 48 hours before rental:</strong> No refund.</li>
              <li><strong>Weather:</strong> No refunds for weather. Renter may reschedule for another available date within the same season.</li>
              <li><strong>No-shows:</strong> No refund.</li>
            </ul>
          </Section>

          <Section title="6. Liability Waiver">
            All operators and passengers must sign a digital liability waiver before the rental begins. The waiver acknowledges the inherent risks of personal watercraft operation, releases Full Throttle Utah from liability for ordinary negligence, and requires renters to indemnify Full Throttle Utah against third-party claims. Utah law does not enforce parental waivers for minors (per Hawkins v. Peart); however, minors are still subject to age and certification requirements under state law.
          </Section>

          <Section title="7. Insurance">
            <ul>
              <li>Full Throttle Utah maintains commercial liability and physical damage insurance on its fleet.</li>
              <li>Renter&apos;s personal auto/boat insurance may or may not extend to rented watercraft — renter is responsible for verifying coverage with their carrier.</li>
              <li>Renter is responsible for damages or claims not covered by Full Throttle Utah&apos;s insurance.</li>
            </ul>
          </Section>

          <Section title="8. Prohibited Use">
            <p>Renter shall not, and shall not permit any operator to:</p>
            <ul>
              <li>Operate the equipment under the influence of alcohol, drugs, or any impairing substance.</li>
              <li>Use the equipment for commercial purposes, competitions, or sub-rental.</li>
              <li>Operate in restricted, marked, or unsafe areas.</li>
              <li>Operate without a USCG-approved personal flotation device worn by every rider.</li>
              <li>Modify, repair, or attempt to modify the equipment.</li>
              <li>Tow individuals or objects beyond manufacturer specifications.</li>
            </ul>
            <p>Violation of these terms may result in immediate termination of the rental, forfeiture of deposit, and liability for all resulting damages.</p>
          </Section>

          <Section title="9. SMS Communications">
            By providing your phone number, you consent to receive transactional SMS messages from Full Throttle Utah regarding your reservation, including booking confirmations, reminders, and return notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. See our Privacy Policy for details.
          </Section>

          <Section title="10. Governing Law & Disputes">
            These Terms are governed by the laws of the State of Utah, without regard to conflict of law principles. Any dispute arising from or relating to this rental shall be brought exclusively in the state or federal courts located in Davis County, Utah. The prevailing party in any litigation shall be entitled to recover reasonable attorney&apos;s fees and costs.
          </Section>

          <Section title="11. Severability">
            If any provision of these Terms is found unenforceable, the remaining provisions shall remain in full force and effect.
          </Section>

          <Section title="12. Entire Agreement">
            These Terms, the Privacy Policy, and the Liability Waiver signed at booking constitute the entire agreement between renter and Full Throttle Utah and supersede any prior agreements or representations.
          </Section>

          <Section title="13. Changes to Terms">
            We may update these Terms from time to time. The &quot;Last updated&quot; date at the top reflects the most recent revision. Continued use of our services constitutes acceptance of any updated Terms.
          </Section>

          <Section title="Contact">
            <strong>Full Throttle Utah</strong> (TW Assets LLC d/b/a Full Throttle Utah)<br/>
            Farmington, UT<br/>
            Phone: 801-548-1273<br/>
            Website: www.fullthrottleutah.com
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
