// lib/review-email.js
// Version: 2026-06-02 — Review request email helper
// Created: June 2 2026
//
// Purpose:
//   Fire a "How was your rental?" email to the customer when their rental is marked
//   returned. Called fire-and-forget by app/api/admin/refund-deposit/route.js and
//   app/api/admin/update-booking/route.js — should never throw and should never block
//   the return action even if email delivery fails.
//
// Idempotency:
//   Writes `reviewEmailSentAt` to the original booking PaymentIntent's metadata. On
//   subsequent calls for the same booking, we skip if that flag is set. Prevents
//   duplicate emails if both refund-deposit AND update-booking fire for the same
//   booking, or if the admin double-clicks.
//
// Policy:
//   Sent to ALL customers regardless of return outcome (clean vs damage). The
//   moderation policy ("auto-publish 5-star, flag 1-4 star") handles bad-mood
//   reviews. Edit this file if you want to exclude damage-charge rentals.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const RESEND_URL = 'https://api.resend.com/emails';
const REVIEW_FROM = 'Full Throttle Utah <bookings@fullthrottleutah.com>';
const SITE_URL = 'https://www.fullthrottleutah.com';
const GOOGLE_REVIEW_URL =
  'https://www.google.com/search?q=Full+Throttle+Utah+Farmington+jet+ski+rental';

// Public entry point — called by return endpoints
export async function sendReviewRequest(paymentIntentId) {
  if (!paymentIntentId) {
    console.log('[review-email] No paymentIntentId, skipping');
    return { skipped: true, reason: 'no_pi_id' };
  }

  // Fetch the booking PI for metadata + idempotency check
  let pi;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    console.error('[review-email] Failed to retrieve PaymentIntent:', err.message);
    return { skipped: true, reason: 'pi_fetch_failed' };
  }

  const meta = pi.metadata || {};

  // Idempotency — never send twice for the same booking
  if (meta.reviewEmailSentAt) {
    console.log(`[review-email] Already sent at ${meta.reviewEmailSentAt}, skipping`);
    return { skipped: true, reason: 'already_sent', sentAt: meta.reviewEmailSentAt };
  }

  // Required fields — gracefully skip if missing
  const renterEmail = meta.renterEmail || meta.renter_email;
  const renterName = meta.renterName || meta.renter_name || '';
  const packageName = meta.packageName || meta.package || '';
  const location = meta.location || '';
  // bookingId is the original Stripe checkout session ID — that's what the review form uses.
  // The cs_xxx session ID is never stored in PI metadata (only written to Sheets col A by
  // the webhook). Fall back to a Stripe session lookup so mark_returned / cash_deposit_returned
  // / refund-deposit paths all resolve correctly.
  let bookingId = meta.originalCheckoutSession || meta.booking_id || meta.bookingId || '';
  if (!bookingId) {
    try {
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: paymentIntentId,
        limit: 1,
      });
      bookingId = sessions.data[0]?.id || '';
      if (bookingId)
        console.log(`[review-email] Resolved bookingId via session lookup: ${bookingId}`);
    } catch (lookupErr) {
      console.warn(
        '[review-email] Session lookup failed for PI',
        paymentIntentId,
        ':',
        lookupErr.message
      );
    }
  }

  if (!renterEmail) {
    console.log('[review-email] No renter email in metadata, skipping');
    return { skipped: true, reason: 'no_renter_email' };
  }
  if (!bookingId) {
    console.log('[review-email] No bookingId in metadata, skipping');
    return { skipped: true, reason: 'no_booking_id' };
  }

  // Resend key must be present
  if (!process.env.RESEND_API_KEY) {
    console.log('[review-email] No RESEND_API_KEY, skipping');
    return { skipped: true, reason: 'no_resend_key' };
  }

  const firstName = renterName.trim().split(/\s+/)[0] || 'there';
  const subject = location
    ? `How was your ${packageName || 'rental'} at ${location}?`
    : `How was your Full Throttle Utah rental?`;
  const reviewUrl = `${SITE_URL}/review/${encodeURIComponent(bookingId)}`;

  const html = buildReviewRequestHTML({
    firstName,
    packageName,
    location,
    reviewUrl,
    googleReviewUrl: GOOGLE_REVIEW_URL,
  });

  // Send email
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: REVIEW_FROM,
        to: renterEmail,
        subject,
        html,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error('[review-email] Resend rejected:', res.status, data);
      return { skipped: true, reason: 'resend_error', error: data };
    }
    console.log(`[review-email] Sent to ${renterEmail} (Resend id: ${data.id})`);
  } catch (err) {
    console.error('[review-email] Network error:', err.message);
    return { skipped: true, reason: 'network_error', error: err.message };
  }

  // Mark as sent on the PI metadata (idempotency flag)
  try {
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        ...meta,
        reviewEmailSentAt: new Date().toISOString(),
        reviewEmailRecipient: renterEmail,
      },
    });
  } catch (err) {
    // Already sent successfully — log but don't undo
    console.warn('[review-email] Sent successfully but failed to flag metadata:', err.message);
  }

  return { ok: true, recipient: renterEmail };
}

// ─── Email HTML template ────────────────────────────────────────────────────
function buildReviewRequestHTML({ firstName, packageName, location, reviewUrl, googleReviewUrl }) {
  const rentalLine =
    packageName && location
      ? `${packageName} at ${location}`
      : packageName || location || 'your rental';

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: #0C4A6E; padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0 0 4px; font-size: 24px; font-weight: 700;">How was your trip?</h1>
    <p style="color: #BAE6FD; margin: 0; font-size: 14px;">Your feedback helps other Utah riders</p>
  </div>
  <div style="padding: 32px 24px; background: #F8FAFC; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">

    <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hey ${firstName},</p>

    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px; color: #334155;">
      Thanks again for renting <strong>${rentalLine}</strong> with us — hope you had a blast out there!
    </p>

    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px; color: #334155;">
      If you have 60 seconds, we'd love to hear how it went. Honest feedback helps us improve and helps other folks decide on their first rental:
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${reviewUrl}" style="display: inline-block; background: #EA580C; color: #fff; padding: 16px 32px; border-radius: 10px; font-size: 16px; font-weight: 700; text-decoration: none;">
        ⭐ Leave a Quick Review
      </a>
    </div>

    <div style="background: #FEF3C7; padding: 16px; border-radius: 10px; margin: 24px 0; text-align: center;">
      <div style="font-size: 13px; color: #92400E; line-height: 1.5;">
        <strong>Loved your trip?</strong> A quick Google review goes a long way for a small business like ours.
      </div>
      <a href="${googleReviewUrl}" style="display: inline-block; margin-top: 10px; background: #1F2937; color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; text-decoration: none;">
        Leave a Google Review →
      </a>
    </div>

    <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 24px 0 8px;">
      Got a question, a comment, or just want to plan another trip? Reply to this email or text us at <strong>(801) 548-1273</strong> — we read every message.
    </p>

    <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 16px 0 0;">
      Talk soon,<br/>
      <strong>Travis &amp; the Full Throttle Utah team</strong>
    </p>

    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8; text-align: center;">
      Full Throttle Utah · TW Assets LLC · Farmington, UT<br/>
      <a href="${SITE_URL}" style="color: #0C4A6E; text-decoration: none;">fullthrottleutah.com</a>
    </div>
  </div>
</div>`;
}
