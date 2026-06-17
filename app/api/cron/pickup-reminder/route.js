// app/api/cron/pickup-reminder/route.js
// Version: 2026-06-02 PM — Use selected pickup time in reminder SMS + email
// Last edited: June 2 2026 (evening)
// Change: SMS pickup line and email pickup section now use the customer's
//         chosen pickup time (from Sheet column T via getTomorrowsBookings)
//         instead of the hardcoded "8:00 AM". Email also shows the return
//         time. Falls back to "8:00 AM" / "8:00 PM" defaults for any
//         pre-feature bookings.
//
// Builds on: api-cron-pickup-reminder_2026-06-02_surface-vest-data.js
// Triggered daily at 14:00 UTC (8:00 AM MDT) via Vercel cron.

import { NextResponse } from 'next/server';
import { getTomorrowsBookings } from '../../../../lib/sheets';
import { sendSMS } from '../../../../lib/sms';
import { getDepositAmount } from '../../../../lib/deposit';

// ─── SMS copy ────────────────────────────────────────────────────────────────
// Target: ~160 chars. Direct, actionable, no filler.
function buildReminderSMS(booking) {
  const firstName = booking.renter_name.split(' ')[0];
  const dateDisplay = booking.end_date && booking.end_date !== booking.start_date
    ? `${booking.start_date} – ${booking.end_date}`
    : booking.start_date;

  const lines = [
    `Hi ${firstName}! Your Full Throttle Utah rental is TOMORROW.`,
    `📍 Pickup: Farmington, UT — ${booking.pickup_time_display || '8:00 AM'}`,
    `🛥️ ${booking.package} · ${booking.location} · ${dateDisplay}`,
  ];

  // NEW (2026-06-02): vest line — only added if data is present.
  // Customer doesn't see the (default) tag here — that's an owner-only signal.
  if (booking.vest_summary) {
    lines.push(`🦺 Vests ready: ${booking.vest_summary}`);
  }

  lines.push(`💵 Bring $${getDepositAmount(booking.package).toLocaleString()} security deposit (card or cash)`);
  lines.push(`⛽ Return with FULL tank of 91-octane or fuel charges apply`);
  lines.push(`❓ Questions? Text/call (801) 548-1273`);

  if (booking.white_glove) {
    // Swap pickup line for delivery note that uses chosen delivery time
    lines[1] = `🚚 White Glove delivery — arriving at ${booking.pickup_time_display || '8:00 AM'}`;
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

  const pickupTimeDisplay = booking.pickup_time_display || '8:00 AM';
  const returnTimeDisplay = booking.return_time_display || '8:00 PM';

  const pickupSection = booking.white_glove
    ? `<div style="background:#EFF6FF;padding:16px;border-radius:8px;margin:16px 0;">
        <strong style="color:#1E40AF;">🚚 White Glove Delivery</strong>
        <p style="color:#1E40AF;margin:8px 0 0 0;font-size:14px;line-height:1.5;">
          We'll deliver directly to <strong>${booking.location}</strong>.<br/>
          <strong>Arrival:</strong> ${pickupTimeDisplay}<br/>
          <strong>Retrieval:</strong> ${returnTimeDisplay}<br/>
          We'll text or call shortly to confirm. Have your $${getDepositAmount(booking.package).toLocaleString()} security deposit ready (card hold or cash).
        </p>
       </div>`
    : `<div style="background:#EFF6FF;padding:16px;border-radius:8px;margin:16px 0;">
        <strong style="color:#1E40AF;">📍 Pickup Details</strong>
        <p style="color:#1E40AF;margin:8px 0 0 0;font-size:14px;line-height:1.5;">
          <strong>Location:</strong> Farmington, UT (exact address provided at pickup)<br/>
          <strong>Pickup Time:</strong> ${pickupTimeDisplay}<br/>
          <strong>Return Time:</strong> ${returnTimeDisplay}<br/>
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
          <tr style="background:#fff;"><td style="padding:8px;color:#64748b;font-size:13px;">Security Deposit Due</td><td style="padding:8px;font-weight:700;font-size:16px;color:#DC2626;">$${getDepositAmount(booking.package).toLocaleString()} (card or cash)</td></tr>
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
            <li>$${getDepositAmount(booking.package).toLocaleString()} security deposit (card or cash)</li>
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

// ─── Owner summary SMS ───────────────────────────────────────────────────────
function buildOwnerSummary(bookings, targetDate) {
  const header = `📅 FTU pickups tomorrow ${targetDate} (${bookings.length}):`;
  const lines = bookings.map((b, i) => {
    const time = b.pickup_time_display || '8:00 AM';
    const wg = b.white_glove ? ' 🚚' : '';
    return `${i + 1}. ${b.renter_name} — ${b.package} · ${b.location} @ ${time}${wg}`;
  });
  return [header, ...lines].join('\n');
}

// ─── Cron handler ────────────────────────────────────────────────────────────
export async function GET(request) {
  // Refuse to run if CRON_SECRET is not configured — an empty string would make
  // the expected header "Bearer " which a blank token satisfies.
  if (!process.env.CRON_SECRET) {
    console.error('[pickup-reminder] CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // Verify this is called by Vercel cron (not a random public request)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('[pickup-reminder] Unauthorized cron attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  const dateOverride = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

  let processed = 0;
  let smsSent = 0;
  let emailsSent = 0;
  let ownerSmsSent = 0;
  let errors = 0;

  try {
    const bookings = await getTomorrowsBookings(dateOverride);

    if (bookings.length === 0) {
      console.log('[pickup-reminder] No bookings tomorrow, nothing to do');
      return NextResponse.json({ ok: true, processed: 0, smsSent: 0, emailsSent: 0, ownerSmsSent: 0 });
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

    const ownerPhones = process.env.OWNER_PHONE_NUMBER;
    if (ownerPhones) {
      try {
        const targetDate = dateOverride || bookings[0]?.start_date || '';
        const ownerMsg = buildOwnerSummary(bookings, targetDate);
        await sendSMS(ownerPhones, ownerMsg);
        console.log('[pickup-reminder] Owner summary SMS sent');
        ownerSmsSent = 1;
      } catch (err) {
        console.error('[pickup-reminder] Owner summary SMS failed:', err.message);
        errors++;
      }
    }

    console.log(`[pickup-reminder] Done — ${smsSent} SMS, ${emailsSent} emails, ${ownerSmsSent} owner SMS, ${errors} errors`);
    return NextResponse.json({ ok: true, processed, smsSent, emailsSent, ownerSmsSent, errors });

  } catch (err) {
    console.error('[pickup-reminder] Fatal error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
