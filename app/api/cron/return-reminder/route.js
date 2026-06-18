// app/api/cron/return-reminder/route.js
// Version: 2026-06-18 — Return-day reminder for multi-day rentals
//
// Fires daily at 15:00 UTC (9 AM MDT) via Vercel Cron — one hour after
// pickup-reminder. Reads Sheet1 for multi-day bookings whose end_date is
// tomorrow. Sends each opted-in renter an SMS reminder; renters without SMS
// opt-in get a Resend email. After processing renters, sends ONE owner
// summary SMS listing every return expected tomorrow.
//
// Single-day rentals are excluded — the pickup-reminder already covers
// fuel policy and return info for same-day rentals.
//
// Auth: Authorization: Bearer CRON_SECRET
// Override: ?date=YYYY-MM-DD for testing without waiting for the real cron.

import { NextResponse } from 'next/server';
import { getTomorrowsReturns } from '../../../../lib/sheets';
import { sendSMS } from '../../../../lib/sms';

// ─── SMS copy ────────────────────────────────────────────────────────────────
function buildReturnReminderSMS(booking) {
  const firstName = (booking.renter_name || '').split(' ')[0] || 'there';
  const returnTime = booking.return_time_display || '8:00 PM';

  const lines = [
    `Hi ${firstName}! Your Full Throttle Utah rental ends TOMORROW.`,
    `🕐 Return by ${returnTime} — ${booking.package} · ${booking.location}`,
    `⛽ Return with FULL tank of 91-octane or fuel charges apply`,
    `❓ Questions? Text/call (801) 548-1273`,
  ];

  if (booking.white_glove) {
    lines[1] = `🚚 White Glove retrieval TOMORROW at ${returnTime} — ${booking.location}`;
  }

  return lines.join('\n');
}

// ─── Email HTML ───────────────────────────────────────────────────────────────
function buildReturnReminderEmailHTML(booking) {
  const firstName = (booking.renter_name || '').split(' ')[0] || 'there';
  const returnTime = booking.return_time_display || '8:00 PM';
  const dateDisplay = booking.end_date && booking.end_date !== booking.start_date
    ? `${booking.start_date} → ${booking.end_date}`
    : booking.start_date || '';

  const returnSection = booking.white_glove
    ? `<div style="background:#EFF6FF;padding:16px;border-radius:8px;margin:16px 0;">
        <strong style="color:#1E40AF;">🚚 White Glove Retrieval</strong>
        <p style="color:#1E40AF;margin:8px 0 0 0;font-size:14px;line-height:1.5;">
          We'll retrieve the watercraft at <strong>${returnTime}</strong> from <strong>${booking.location}</strong>.<br/>
          Please have everything ready at the agreed-upon spot. We'll text you when we're 30 minutes out.
        </p>
       </div>`
    : `<div style="background:#EFF6FF;padding:16px;border-radius:8px;margin:16px 0;">
        <strong style="color:#1E40AF;">📍 Return Details</strong>
        <p style="color:#1E40AF;margin:8px 0 0 0;font-size:14px;line-height:1.5;">
          <strong>Return Location:</strong> Farmington, UT (same as pickup)<br/>
          <strong>Return By:</strong> ${returnTime}<br/>
          <strong>Bring:</strong> All gear, life vests, anchor, and safety flag
        </p>
       </div>`;

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0C4A6E;padding:24px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">🔔 Your Rental Ends Tomorrow!</h1>
      </div>
      <div style="padding:24px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        <p style="font-size:16px;">Hi ${firstName},</p>
        <p>Just a quick heads-up — your Full Throttle Utah rental ends <strong>tomorrow</strong>. Here's what you need to know before you wrap up.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px;color:#64748b;font-size:13px;">Package</td><td style="padding:8px;font-weight:600;">${booking.package || '—'}</td></tr>
          <tr style="background:#fff;"><td style="padding:8px;color:#64748b;font-size:13px;">Location</td><td style="padding:8px;font-weight:600;">${booking.location || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b;font-size:13px;">Rental Dates</td><td style="padding:8px;font-weight:600;">${dateDisplay}</td></tr>
          <tr style="background:#fff;"><td style="padding:8px;color:#64748b;font-size:13px;">Return Time</td><td style="padding:8px;font-weight:700;color:#DC2626;">${returnTime}</td></tr>
        </table>

        ${returnSection}

        <div style="background:#FEE2E2;padding:16px;border-radius:8px;margin:16px 0;">
          <strong style="color:#991B1B;">⛽ Fuel Policy — Important!</strong>
          <p style="color:#991B1B;margin:8px 0 0 0;font-size:14px;line-height:1.5;">
            Return with a <strong>FULL tank of 91-octane gasoline</strong>.<br/>
            Short on fuel? We charge actual refueling cost + 20% service premium, deducted from your security deposit.
          </p>
        </div>

        <div style="background:#F0FDF4;padding:16px;border-radius:8px;margin:16px 0;">
          <strong style="color:#166534;">✅ Return Checklist</strong>
          <ul style="color:#166534;margin:8px 0 0 0;padding-left:20px;font-size:14px;line-height:1.8;">
            <li>Full tank of 91-octane gasoline</li>
            <li>All life vests, anchor, and safety flag returned</li>
            <li>Watercraft rinsed and on the trailer</li>
            ${!booking.white_glove ? '<li>Tow vehicle with 2" ball hitch for return trip</li>' : ''}
            <li>Remove all personal items before return</li>
          </ul>
        </div>

        <p style="font-size:14px;color:#64748b;">
          Questions or need to adjust your return time? Call or text Travis: <strong>(801) 548-1273</strong>
        </p>
        <p style="font-size:15px;">Thanks for riding with us! 🌊</p>
        <p><strong>Full Throttle Utah</strong><br/>TW Assets LLC · Farmington, UT</p>
      </div>
    </div>
  `;
}

// ─── Send reminder email via Resend ──────────────────────────────────────────
async function sendReturnReminderEmail(booking) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.log('[return-reminder] No Resend key, skipping email for', booking.renter_email);
    return { ok: false, reason: 'no_resend_key' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: 'Full Throttle Utah <bookings@fullthrottleutah.com>',
      to: booking.renter_email,
      subject: `🔔 Reminder: Your rental ends tomorrow — return by ${booking.return_time_display || '8:00 PM'}`,
      html: buildReturnReminderEmailHTML(booking),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[return-reminder] Email failed for', booking.renter_email, data);
    return { ok: false, reason: data };
  }

  console.log('[return-reminder] Email sent to', booking.renter_email);
  return { ok: true };
}

// ─── Owner summary SMS ───────────────────────────────────────────────────────
function buildOwnerReturnSummary(returns, targetDate) {
  const header = `📅 FTU returns tomorrow ${targetDate} (${returns.length}):`;
  const lines = returns.map((b, i) => {
    const time = b.return_time_display || '8:00 PM';
    const wg = b.white_glove ? ' 🚚' : '';
    return `${i + 1}. ${b.renter_name} — ${b.package} · ${b.location} @ ${time}${wg}`;
  });
  return [header, ...lines].join('\n');
}

// ─── Cron handler ────────────────────────────────────────────────────────────
export async function GET(request) {
  if (!process.env.CRON_SECRET) {
    console.error('[return-reminder] CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('[return-reminder] Unauthorized cron attempt');
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
    const returns = await getTomorrowsReturns(dateOverride);

    if (returns.length === 0) {
      console.log('[return-reminder] No returns tomorrow, nothing to do');
      return NextResponse.json({ ok: true, processed: 0, smsSent: 0, emailsSent: 0, ownerSmsSent: 0 });
    }

    for (const booking of returns) {
      try {
        if (booking.sms_opt_in && booking.renter_phone) {
          const msg = buildReturnReminderSMS(booking);
          await sendSMS(booking.renter_phone, msg);
          console.log(`[return-reminder] SMS sent → ${booking.renter_name} (${booking.renter_phone})`);
          smsSent++;
        } else if (booking.renter_email) {
          const result = await sendReturnReminderEmail(booking);
          if (result.ok) emailsSent++;
          else errors++;
        } else {
          console.warn(`[return-reminder] No contact method for booking ${booking.booking_id}`);
          errors++;
        }
        processed++;
      } catch (err) {
        console.error(`[return-reminder] Failed for ${booking.booking_id}:`, err.message);
        errors++;
      }
    }

    const ownerPhones = process.env.OWNER_PHONE_NUMBER;
    if (ownerPhones) {
      try {
        const targetDate = dateOverride || returns[0]?.end_date || '';
        const ownerMsg = buildOwnerReturnSummary(returns, targetDate);
        await sendSMS(ownerPhones, ownerMsg);
        console.log('[return-reminder] Owner summary SMS sent');
        ownerSmsSent = 1;
      } catch (err) {
        console.error('[return-reminder] Owner summary SMS failed:', err.message);
        errors++;
      }
    }

    console.log(`[return-reminder] Done — ${smsSent} SMS, ${emailsSent} emails, ${ownerSmsSent} owner SMS, ${errors} errors`);
    return NextResponse.json({ ok: true, processed, smsSent, emailsSent, ownerSmsSent, errors });

  } catch (err) {
    console.error('[return-reminder] Fatal error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
