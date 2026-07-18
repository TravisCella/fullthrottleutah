// app/api/admin/test-review-email/route.js
// Version: 2026-06-02 — Admin-only test trigger for review request emails
// Created: June 2 2026
//
// Purpose:
//   Lets Travis fire a review request email manually against any booking, even if
//   it was already sent. Bypasses the idempotency flag so we can test the template
//   rendering, deliverability, and customer experience without waiting for a real
//   rental return.
//
// Usage:
//   curl -X POST https://www.fullthrottleutah.com/api/admin/test-review-email \
//     -H "Content-Type: application/json" \
//     -d '{"password":"YOUR_ADMIN_PASSWORD","bookingId":"cs_live_a1cXcrYxxx","overrideEmail":"travis.cella@gmail.com"}'
//
//   - bookingId: required — the Stripe checkout session ID from Sheet1 column A
//   - overrideEmail: optional — if you want the test email sent to yourself instead
//     of the actual customer (recommended for testing!)
//   - clearFlag: optional — pass true to also reset the reviewEmailSentAt flag so
//     future real-return triggers will fire again
//
// Security: requires ADMIN_PASSWORD in the request body, same as other admin endpoints.

import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const RESEND_URL = 'https://api.resend.com/emails';
const REVIEW_FROM = 'Full Throttle Utah <bookings@fullthrottleutah.com>';
const SITE_URL = 'https://www.fullthrottleutah.com';
const GOOGLE_REVIEW_URL =
  'https://www.google.com/search?q=Full+Throttle+Utah+Farmington+jet+ski+rental';

export async function POST(request) {
  try {
    const { password, bookingId, overrideEmail, clearFlag } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
    }

    // Find the original booking's PaymentIntent.
    // bookingId is the Stripe Checkout Session ID — look it up and expand the PI.
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(bookingId, {
        expand: ['payment_intent'],
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Could not find checkout session ${bookingId}: ${err.message}` },
        { status: 404 }
      );
    }

    const pi = session.payment_intent;
    if (!pi || typeof pi === 'string') {
      return NextResponse.json({ error: 'No PaymentIntent on this session' }, { status: 400 });
    }

    const meta = pi.metadata || {};
    const renterEmail = overrideEmail || meta.renterEmail || meta.renter_email;
    const renterName = meta.renterName || meta.renter_name || '';
    const packageName = meta.packageName || meta.package || '';
    const location = meta.location || '';

    if (!renterEmail) {
      return NextResponse.json(
        { error: 'No renter email in metadata and no overrideEmail provided' },
        { status: 400 }
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    const firstName = renterName.trim().split(/\s+/)[0] || 'there';
    const subject = location
      ? `[TEST] How was your ${packageName || 'rental'} at ${location}?`
      : `[TEST] How was your Full Throttle Utah rental?`;
    const reviewUrl = `${SITE_URL}/review/${encodeURIComponent(bookingId)}`;

    const html = buildReviewRequestHTML({
      firstName,
      packageName,
      location,
      reviewUrl,
      googleReviewUrl: GOOGLE_REVIEW_URL,
      isTest: true,
    });

    // Send the email
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
      return NextResponse.json(
        { error: 'Resend rejected the email', details: data, status: res.status },
        { status: 500 }
      );
    }

    // Optionally clear the idempotency flag (so a future real return will fire again)
    if (clearFlag) {
      const cleaned = { ...meta };
      delete cleaned.reviewEmailSentAt;
      delete cleaned.reviewEmailRecipient;
      await stripe.paymentIntents.update(pi.id, { metadata: cleaned });
    }

    return NextResponse.json({
      ok: true,
      sentTo: renterEmail,
      resendId: data.id,
      bookingId,
      reviewUrl,
      previewOf: {
        renterName,
        packageName,
        location,
        wasOverridden: !!overrideEmail,
      },
      flagCleared: !!clearFlag,
    });
  } catch (err) {
    console.error('[test-review-email] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── Email HTML template — same as lib/review-email.js, with optional [TEST] banner
function buildReviewRequestHTML({
  firstName,
  packageName,
  location,
  reviewUrl,
  googleReviewUrl,
  isTest,
}) {
  const rentalLine =
    packageName && location
      ? `${packageName} at ${location}`
      : packageName || location || 'your rental';

  const testBanner = isTest
    ? `<div style="background: #FEF3C7; border-left: 4px solid #D97706; padding: 12px 16px; margin: 16px 0; border-radius: 6px;">
        <div style="font-size: 12px; color: #92400E; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">⚠️ Test Email</div>
        <div style="font-size: 13px; color: #92400E; margin-top: 4px;">This was fired manually from the admin test endpoint. It will not be sent to the real customer unless triggered by an actual rental return.</div>
      </div>`
    : '';

  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
  <div style="background: #0C4A6E; padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0 0 4px; font-size: 24px; font-weight: 700;">How was your trip?</h1>
    <p style="color: #BAE6FD; margin: 0; font-size: 14px;">Your feedback helps other Utah riders</p>
  </div>
  <div style="padding: 32px 24px; background: #F8FAFC; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">

    ${testBanner}

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
