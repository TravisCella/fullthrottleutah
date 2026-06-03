// app/api/cron/pickup-reminder/route.js
// Version: 2026-06-02 — Surface life vest selection in reminder SMS + email
// Last edited: June 2 2026
// Change: Both SMS and email now show what life vests we'll have ready, so
//         the customer can spot-check before they show up. SMS adds a 🦺 line
//         after the package line; email adds a Life Vests row to the details
//         table. Data flows in via getTomorrowsBookings() (lib/sheets.js was
//         updated 2026-06-02 to read Sheet1 column S).
//
// Builds on: api-cron-pickup-reminder_2026-05-31_use-verified-domain-email.js
// Triggered daily at 14:00 UTC (8:00 AM MDT) via Vercel cron.

import { NextResponse } from 'next/server';
import { getTomorrowsBookings } from '../../../../lib/sheets';
import { sendSMS } from '../../../../lib/sms';

// ─── SMS copy ────────────────────────────────────────────────────────────────
// Target: ~160 chars. Direct, actionable, no filler.
function buildReminderSMS(booking) {
  const firstName = booking.renter_name.split(' ')[0];
  const dateDisplay = booking.end_date && booking.end_date !== booking.start_date
    ? `${booking.start_date} – ${booking.end_date}`
    : booking.start_date;

  const lines = [
    `Hi ${firstName}! Your Full Throttle Utah rental is TOMORROW.`,
    `📍 Pickup: Farmington, UT — 8:00 AM`,
    `🛥️ ${booking.package} · ${booking.location} · ${dateDisplay}`,
  ];

  // NEW (2026-06-02): vest line — only added if data is present.
  // Customer doesn't see the (default) tag here — that's an owner-only signal.
  if (booking.vest_summary) {
    lines.push(`🦺 Vests ready: ${booking.vest_summary}`);
  }

  lines.push(`💵 Bring $1,000 security deposit (card or cash)`);
  lines.push(`⛽ Return with FULL tank of 91-octane or fuel charges apply`);
  lines.push(`❓ Questions? Text/call (801) 548-1273`);

  if (booking.white_glove) {
    // Swap pickup line for delivery note
    lines[1] = `🚚 White Glove delivery — we'll be in touch to confirm arrival time`;
  }

  return lines.join('\n');
}

// ─── Email HTML ───────────────────────────────────────────────────────────────
function buildReminderEmailHTML(booking) {
  const firstName = booking.renter_name.split(' ')[0];
  const dateDisplay = booking.end_date && booking.end_date !== booking.start_date
    ? `${booking.start_date} → ${booking.end_date}`
    : booking.start_date;

  // NEW (2026-06-02): optional Life Vests row — appended only when data present
  const vestRow = booking.vest_summary
    ? `<tr style="background:#fff;"><td style="padding:8px;color:#64748b;font-size:13px;">🦺 Life Vests</td><td style="padding:8px;font-weight:600;">${booking.vest_summary}</td></tr>`
    : '';

  const pickupSection = booking.white_glove
    ? `<div style="background:#EFF6FF;padding:16px;border-radius:8px;margin:16px 0;">
        <strong style="color:#1E40AF;">🚚 White Glove Delivery</strong>
        <p style="color:#1E40AF;margin:8px 0 0 0;font-size:14px;line-height:1.5;">
          We'll deliver directly to <strong>${booking.location}</strong>. 
          We'll contact you shortly to confirm your exact arrival time. 
          Have your $1,000 security deposit ready (card hold or cash).
        </p>
       </div>`
    : `<div style="background:#EFF6FF;padding:16px;border-radius:8px;margin:16px 0;">
        <strong style="color:#1E40AF;">📍 Pickup Details</strong>
        <p style="color:#1E40AF;margin:8px 0 0 0;font-size:14px;line-height:1.5;">
          <strong>Location:</strong> Farmington, UT (exact address provided at pickup)<br/>
          <strong>Time:</strong> 8:00 AM sharp<br/>
          <strong>Bring:</strong> Valid driver's license + vehicle with 2" ball hitch + flat 4-prong lights
        </p>
       </div>`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0C4A6E;padding:24px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">⏰ Your Rental is Tomorrow!</h1>
      </div>
      <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        <p style="font-size:16px;">Hi ${firstName},</p>
        <p>Just a quick reminder — your Full Throttle Utah rental is <strong>tomorrow</strong>. Here's everything you need:</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;color:#64748b;font-size:13px;">Package</td><td style="padding:8px;font-weight:600;">${booking.package}</td></tr>
          <tr style="background:#fff;"><td style="padding:8px;color:#64748b;font-size:13px;">Location</td><td style="padding:8px;font-weight:600;">${booking.location}</td></tr>
          <tr><td style="padding:8px;color:#64748b;font-size:13px;">Dates</td><td style="padding:8px;font-weight:600;">${dateDisplay}</td></tr>
          ${vestRow}
          <tr style="background:#fff;"><td style="padding:8px;color:#64748b;font-size:13px;">Security Deposit Due</td><td style="padding:8px;font-weight:700;font-size:16px;color:#DC2626;">$1,000 (card or cash)</td></tr>
        </table>

        ${pickupSection}

        <div style="background:#FEE2E2;padding:16px;border-radius:8px;margin:16px 0;">
          <strong style="color:#991B1B;">⛽ Fuel Policy Reminder</strong>
          <p style="color:#991B1B;margin:8px 0 0 0;font-size:14px;line-height:1.5;">
            Return with a <strong>FULL tank of 91-octane gasoline</strong>. 
            Short on fuel? We charge actual refueling cost + 20% service premium, deducted from your deposit.
          </p>
        </div>

        <div style="background:#F0FDF4;padding:16px;border-radius:8px;margin:16px 0;">
          <strong style="color:#166534;">✅ Quick Checklist</strong>
          <ul style="color:#166534;margin:8px 0 0 0;padding-left:20px;font-size:14px;line-height:1.8;">
            <li>Valid driver's license</li>
            <li>$1,000 security deposit (card or cash)</li>
            ${!booking.white_glove ? '<li>Tow vehicle with 2" ball hitch + flat 4-prong lights</li>' : ''}
            <li>Sunscreen, water, and a great attitude</li>
          </ul>
        </div>

        <p style="font-size:14px;color:#64748b;">
          Questions? Call or text Travis directly: <strong>(801) 548-1273</strong>
        </p>
        <p style="font-size:13px;color:#64748b;">
          📋 <a href="https://www.fullthrottleutah.com/cancellation-policy" style="color:#0C4A6E;">Cancellation &amp; Weather Policy</a>
        </p>
        <p style="font-size:15px;">See you on the water! 🌊</p>
        <p><strong>Full Throttle Utah</strong><br/>TW Assets LLC · Farmington, UT</p>
      </div>
    </div>
  `;
}

// ─── Send reminder email via Resend ──────────────────────────────────────────
async function sendReminderEmail(booking) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.log('[pickup-reminder] No Resend key, skipping email for', booking.renter_email);
    return { ok: false, reason: 'no_resend_key' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: 'Full Throttle Utah <bookings@fullthrottleutah.com>',
      to: booking.renter_email,
      subject: `⏰ Reminder: Your rental is tomorrow — ${booking.package} at ${booking.location}`,
      html: buildReminderEmailHTML(booking),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[pickup-reminder] Email failed for', booking.renter_email, data);
    return { ok: false, reason: data };
  }

  console.log('[pickup-reminder] Email sent to', booking.renter_email);
  return { ok: true };
}

// ─── Cron handler ────────────────────────────────────────────────────────────
export async function GET(request) {
  // Verify this is called by Vercel cron (not a random public request)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('[pickup-reminder] Unauthorized cron attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let processed = 0;
  let smsSent = 0;
  let emailsSent = 0;
  let errors = 0;

  try {
    const bookings = await getTomorrowsBookings();

    if (bookings.length === 0) {
      console.log('[pickup-reminder] No bookings tomorrow, nothing to do');
      return NextResponse.json({ ok: true, processed: 0 });
    }

    for (const booking of bookings) {
      try {
        if (booking.sms_opt_in && booking.renter_phone) {
          const msg = buildReminderSMS(booking);
          await sendSMS(booking.renter_phone, msg);
          console.log(`[pickup-reminder] SMS sent → ${booking.renter_name} (${booking.renter_phone})`);
          smsSent++;
        } else if (booking.renter_email) {
          const result = await sendReminderEmail(booking);
          if (result.ok) emailsSent++;
          else errors++;
        } else {
          console.warn(`[pickup-reminder] No contact method for booking ${booking.booking_id}`);
          errors++;
        }
        processed++;
      } catch (err) {
        console.error(`[pickup-reminder] Failed for ${booking.booking_id}:`, err.message);
        errors++;
      }
    }

    console.log(`[pickup-reminder] Done — ${smsSent} SMS, ${emailsSent} emails, ${errors} errors`);
    return NextResponse.json({ ok: true, processed, smsSent, emailsSent, errors });

  } catch (err) {
    console.error('[pickup-reminder] Fatal error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
