// lib/win-back-email.js
// Sends an abandoned-checkout nudge email via Resend.
// Called by the win-back cron only — never by the payment path.

/**
 * @param {object} params
 * @param {string} params.renterEmail
 * @param {string} params.renterName
 * @param {string} params.packageName
 * @param {string} params.location
 * @param {string} params.startDate
 * @param {string} params.endDate
 * @param {string} params.checkoutUrl
 */
export async function sendWinBackEmail({
  renterEmail,
  renterName,
  packageName,
  location,
  startDate,
  endDate,
  checkoutUrl,
}) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.log('[win-back-email] No Resend API key — skipping email');
    return { skipped: true, reason: 'no_resend_key' };
  }
  if (!renterEmail) {
    console.log('[win-back-email] No renter email — skipping');
    return { skipped: true, reason: 'no_email' };
  }

  const firstName = (renterName || 'there').split(' ')[0];
  const dates = endDate && endDate !== startDate ? `${startDate} → ${endDate}` : startDate;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #0C4A6E; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Your ride is still waiting 🛥️</h1>
      </div>
      <div style="padding: 28px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin-top: 0; font-size: 16px;">Hi ${firstName},</p>
        <p style="font-size: 15px; line-height: 1.6;">
          You were almost set for <strong>${dates}</strong> on the
          <strong>${packageName}</strong> at <strong>${location}</strong> — looks like
          checkout didn't finish. Your dates aren't reserved until payment's complete, and
          summer weekends fill up fast, so if you still want them, let's lock it in:
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a
            href="${checkoutUrl}"
            style="background: #0C4A6E; color: #fff; text-decoration: none;
                   padding: 16px 36px; border-radius: 8px; font-weight: 700;
                   font-size: 17px; display: inline-block; letter-spacing: 0.01em;"
          >Finish My Booking →</a>
        </div>

        <p style="font-size: 15px; line-height: 1.6;">
          Prefer to skip towing? We deliver white-glove right to the ramp.
          Questions — just reply here or text <strong>801-548-1273</strong>.
        </p>

        <p style="font-size: 15px;">
          See you on the water,<br/>
          <strong>Full Throttle Utah</strong>
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0; line-height: 1.6;">
          TW Assets LLC · Farmington, UT<br/>
          Don't want these reminders? Reply STOP and we won't send another.
        </p>
      </div>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: 'Full Throttle Utah <bookings@fullthrottleutah.com>',
      to: renterEmail,
      subject: 'Finish booking your Full Throttle Utah ride',
      html,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[win-back-email] Resend error:', data);
    throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);
  }
  console.log('[win-back-email] Sent to', renterEmail, '— id:', data.id);
  return { ok: true, id: data.id };
}
