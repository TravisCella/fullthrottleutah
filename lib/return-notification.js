// lib/return-notification.js
// Version: 2026-06-13 — Renter deposit-settlement notification
//
// Fires after a security deposit is released (clean return) or partially
// captured (damage). Called fire-and-forget from refund-deposit/route.js.
//
// SMS:   gated by smsOptIn on the original booking PI.
// Email: fires for ALL renters regardless of smsOptIn — it is a financial
//        receipt, not a marketing message.
//
// Data sources:
//   depositHold.metadata — renterEmail, renterName (written when hold created)
//   origBookingPI.metadata — renterPhone, smsOptIn, packageName, location,
//                            startDate, endDate

import Stripe from 'stripe';
import { sendSMS } from './sms.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const RESEND_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'Full Throttle Utah <bookings@fullthrottleutah.com>';

// ─── SMS copy ─────────────────────────────────────────────────────────────────

function buildReturnSMS({ firstName, action, capturedAmount, releasedAmount }) {
  if (action === 'release') {
    return [
      `Your Full Throttle Utah rental is complete! 🎉`,
      `$${releasedAmount.toFixed(2)} security hold released — funds return in 3–7 business days.`,
      `Questions? (801) 548-1273. Reply STOP to opt out.`,
    ].join('\n');
  }

  // Damage capture — damage reason goes in the email only, not SMS.
  return [
    `Hi ${firstName}, your Full Throttle Utah rental is complete.`,
    `$${capturedAmount.toFixed(2)} charged for return condition — itemized receipt sent to your email.`,
    `$${releasedAmount.toFixed(2)} released to your card. Funds return in 3–7 business days.`,
    `Questions? (801) 548-1273. Reply STOP to opt out.`,
  ].join('\n');
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

function buildReturnEmailHTML({
  firstName,
  action,
  capturedAmount,
  releasedAmount,
  damageReason,
  packageName,
  location,
  startDate,
  endDate,
}) {
  const holdTotal = capturedAmount + releasedAmount;
  const isClean = action === 'release';

  const title = isClean ? 'Rental Complete — Hold Released' : 'Rental Complete — Deposit Summary';
  const subtitle = isClean
    ? 'Your security hold has been fully released back to your card.'
    : "Here's a summary of how your security deposit was settled.";

  const rentalLine = [packageName, location].filter(Boolean).join(' — ') || 'your rental';
  const datesLine =
    startDate && endDate && endDate !== startDate ? `${startDate} → ${endDate}` : startDate || '';

  const chargedRow = isClean
    ? `<tr><td style="padding:8px;color:#64748b;font-size:13px;">Amount Charged</td><td style="padding:8px;font-weight:700;color:#16A34A;">$0.00</td></tr>`
    : `<tr><td style="padding:8px;color:#64748b;font-size:13px;">Amount Charged</td><td style="padding:8px;font-weight:700;color:#DC2626;">$${capturedAmount.toFixed(2)}</td></tr>`;

  const reasonRow =
    !isClean && damageReason
      ? `<tr style="background:#fff;"><td style="padding:8px;color:#64748b;font-size:13px;">Reason</td><td style="padding:8px;font-weight:600;">${damageReason}</td></tr>`
      : '';

  const releasedRow = `<tr${isClean ? '' : ' style="background:#fff;"'}><td style="padding:8px;color:#64748b;font-size:13px;">Released to Card</td><td style="padding:8px;font-weight:700;color:#16A34A;">$${releasedAmount.toFixed(2)}</td></tr>`;

  const closingCopy = isClean
    ? `Hope you had a blast out there! We'd love to have you back.`
    : `If you have questions about the charge, call or text us at <strong>(801) 548-1273</strong> — we're happy to walk through it.`;

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #0C4A6E; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">${title}</h1>
    <p style="color: #BAE6FD; margin: 8px 0 0; font-size: 14px;">${subtitle}</p>
  </div>
  <div style="padding: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">

    <p style="font-size: 16px; margin: 0 0 4px;">Hi ${firstName},</p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 8px 0 20px;">
      Your watercraft has been returned and your rental is officially closed. Here's how your security deposit was handled.
    </p>

    <div style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px;">Rental</div>
    <div style="font-size: 14px; color: #0F172A; font-weight: 600; margin-bottom: 2px;">${rentalLine}</div>
    ${datesLine ? `<div style="font-size: 13px; color: #64748B; margin-bottom: 16px;">${datesLine}</div>` : '<div style="margin-bottom:16px;"></div>'}

    <div style="font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px;">Deposit Settlement</div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr><td style="padding:8px;color:#64748b;font-size:13px;">Security Hold</td><td style="padding:8px;font-weight:600;">$${holdTotal.toFixed(2)}</td></tr>
      ${chargedRow}
      ${reasonRow}
      ${releasedRow}
    </table>

    <div style="background: #EFF6FF; padding: 14px; border-radius: 8px; margin: 0 0 20px;">
      <div style="font-size: 13px; color: #1E40AF; line-height: 1.5;">
        💳 Released funds typically take <strong>3–7 business days</strong> to appear on your statement, depending on your bank. The hold may disappear from your pending charges sooner.
      </div>
    </div>

    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 20px;">${closingCopy}</p>

    <p style="font-size: 13px; color: #64748b; margin: 0;">
      — Travis &amp; the Full Throttle Utah team
    </p>

    <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8; text-align: center;">
      Full Throttle Utah · TW Assets LLC · Farmington, UT<br/>
      <a href="https://www.fullthrottleutah.com" style="color: #0C4A6E; text-decoration: none;">fullthrottleutah.com</a>
    </div>
  </div>
</div>`;
}

// ─── Internal async worker ────────────────────────────────────────────────────

async function _sendReturnNotification(
  depositHold,
  origPiId,
  { action, capturedAmount, releasedAmount, damageReason }
) {
  const renterEmail = depositHold?.metadata?.renterEmail;
  const renterName = depositHold?.metadata?.renterName || '';

  if (!renterEmail) {
    console.warn('[return-notification] No renterEmail on deposit hold metadata — skipping');
    return;
  }

  // Resolve booking context + consent from the original booking PI.
  let renterPhone = null;
  let smsOptIn = false;
  let packageName = '';
  let location = '';
  let startDate = '';
  let endDate = '';

  if (origPiId) {
    try {
      const origPI = await stripe.paymentIntents.retrieve(origPiId);
      const m = origPI.metadata || {};
      renterPhone = m.renterPhone || m.renter_phone || null;
      smsOptIn = m.smsOptIn === 'true' || m.sms_opt_in === 'true' || m.sms_consent === 'true';
      packageName = m.packageName || m.package || '';
      location = m.location || '';
      startDate = m.startDate || m.start_date || '';
      endDate = m.endDate || m.end_date || '';
    } catch (err) {
      console.warn('[return-notification] Could not retrieve original booking PI:', err.message);
    }
  }

  const firstName = renterName.trim().split(/\s+/)[0] || 'there';

  // ── SMS — gated by explicit opt-in ──────────────────────────────────────
  if (smsOptIn && renterPhone) {
    try {
      const smsBody = buildReturnSMS({ firstName, action, capturedAmount, releasedAmount });
      await sendSMS(renterPhone, smsBody);
      console.log('[return-notification] SMS sent to', renterPhone);
    } catch (err) {
      console.error('[return-notification] SMS failed:', err.message);
    }
  }

  // ── Email — fires for ALL renters, no opt-in gate ───────────────────────
  if (!process.env.RESEND_API_KEY) {
    console.log('[return-notification] No RESEND_API_KEY — skipping email to', renterEmail);
    return;
  }

  const subject =
    action === 'release'
      ? 'Your rental is complete — Full Throttle Utah'
      : 'Rental complete — deposit summary — Full Throttle Utah';

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: renterEmail,
        subject,
        html: buildReturnEmailHTML({
          firstName,
          action,
          capturedAmount,
          releasedAmount,
          damageReason,
          packageName,
          location,
          startDate,
          endDate,
        }),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[return-notification] Email send failed:', data);
    } else {
      console.log('[return-notification] Email sent to', renterEmail, '— Resend id:', data.id);
    }
  } catch (err) {
    console.error('[return-notification] Email network error:', err.message);
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────
// Fire-and-forget — never throws into the caller.
export function fireReturnNotification(
  depositHold,
  origPiId,
  { action, capturedAmount, releasedAmount, damageReason }
) {
  _sendReturnNotification(depositHold, origPiId, {
    action,
    capturedAmount,
    releasedAmount,
    damageReason,
  }).catch((err) => console.error('[return-notification] Uncaught error:', err.message));
}
