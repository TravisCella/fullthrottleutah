// app/api/webhook/route.js
// Version: 2026-06-06 Phase 3 — Add clickable link to agreement view page
// Last edited: June 6 2026
// Feature: The "📜 Rental Agreement" row in the customer confirmation email
//          now renders as a clickable link pointing to the new customer
//          agreement view page (Phase 3) at /agreement/[bookingId]. This
//          gives customers a permanent reference to their signed agreement
//          right from their inbox.
//
// Builds on: 2026-06-06 Phase 2 surfacing

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addBooking } from '../../../lib/sheets';
import { createBookingEvent } from '../../../lib/calendar';
import { sendSMS, buildBookingConfirmationSMS } from '../../../lib/sms';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function sendConfirmationEmail(booking) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.log('No Resend API key, skipping email');
    return;
  }

  // Build the optional life vest row — only shown if we have data for it
  const vestRow = booking.vest_summary
    ? `<tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">🦺 Life Vests</td><td style="padding: 8px; font-weight: 600;">${booking.vest_summary}</td></tr>`
    : '';

  // Pickup & return time rows — always shown (defaults to 8 AM / 8 PM if not selected)
  const pickupRow = `<tr><td style="padding: 8px; color: #64748b; font-size: 13px;">⏰ Pickup Time</td><td style="padding: 8px; font-weight: 600;">${booking.pickup_time_display || '8:00 AM'}</td></tr>`;
  const returnRow = `<tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">⏰ Return Time</td><td style="padding: 8px; font-weight: 600;">${booking.return_time_display || '8:00 PM'}</td></tr>`;

  // Rental Agreement row (Phase 3) — clickable link to the customer-facing
  // agreement view page. Email clients render inline-styled <a> tags reliably.
  const agreementRow = booking.rental_agreement_signed
    ? `<tr><td style="padding: 8px; color: #64748b; font-size: 13px;">📜 Rental Agreement</td><td style="padding: 8px; font-weight: 600;"><a href="https://www.fullthrottleutah.com/agreement/${booking.booking_id}" style="color: #0C4A6E; text-decoration: underline;">Signed ${booking.rental_agreement_version || 'v1.0.0'} — View</a></td></tr>`
    : '';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: 'Full Throttle Utah <bookings@fullthrottleutah.com>',
        to: booking.renter_email,
        subject: `Booking Confirmed — ${booking.package} | Full Throttle Utah`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #0C4A6E; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 24px;">Booking Confirmed!</h1>
            </div>
            <div style="padding: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p>Hi ${booking.renter_name},</p>
              <p>Your reservation with Full Throttle Utah is confirmed. Here are your details:</p>

              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Package</td><td style="padding: 8px; font-weight: 600;">${booking.package}</td></tr>
                <tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Location</td><td style="padding: 8px; font-weight: 600;">${booking.location}</td></tr>
                <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Dates</td><td style="padding: 8px; font-weight: 600;">${booking.start_date}${booking.end_date !== booking.start_date ? ' → ' + booking.end_date : ''}</td></tr>
                <tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Days</td><td style="padding: 8px; font-weight: 600;">${booking.days}</td></tr>
                ${pickupRow}
                ${returnRow}
                ${vestRow}
                ${agreementRow}
                <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Rental Paid in Full</td><td style="padding: 8px; font-weight: 600; color: #16a34a;">$${booking.total_price}</td></tr>
                <tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Due at Pickup</td><td style="padding: 8px; font-weight: 700; font-size: 16px;">$1,000 security deposit</td></tr>
              </table>

              <div style="background: #FEF3C7; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <strong style="color: #92400E;">Before Your Rental:</strong>
                <ol style="color: #92400E; margin: 8px 0; padding-left: 20px; font-size: 14px;">
                  <li>Arrive at Farmington pickup point by 8:00 AM</li>
                  <li>Bring valid driver's license</li>
                  <li>Bring a vehicle with a 2" ball hitch and flat 4-prong light hookup</li>
                  <li>Bring $1,000 security deposit (card hold or cash)</li>
                </ol>
              </div>

              <div style="background: #FEE2E2; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <strong style="color: #991B1B;">⛽ Fuel Policy:</strong>
                <p style="color: #991B1B; margin: 8px 0 0 0; font-size: 14px; line-height: 1.5;">
                  Watercraft must be returned with a <strong>FULL tank of 91-octane gasoline</strong>. If returned with less than full, or fueled with lower octane, we will charge the actual refueling cost plus a 20% service premium, deducted from your security deposit.
                </p>
              </div>

              <p style="font-size: 13px; color: #64748b;">Questions? Reply to this email or call/text us at (714) 856-5676.</p>
              <p style="font-size: 13px; color: #64748b; margin-top: 16px;">📋 <a href="https://www.fullthrottleutah.com/cancellation-policy" style="color: #0C4A6E;">View our Cancellation &amp; Weather Policy</a></p>
              <p style="font-size: 13px; color: #64748b;">See you on the water!</p>
              <p><strong>Full Throttle Utah</strong><br/>TW Assets LLC · Farmington, UT</p>
            </div>
          </div>
        `,
      }),
    });
    const data = await res.json();
    console.log('Email sent:', data);
  } catch (err) {
    console.error('Email error:', err);
  }
}

export async function POST(request) {
  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    let event;

    if (process.env.STRIPE_WEBHOOK_SECRET) {
      try {
        event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    } else {
      event = JSON.parse(body);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      let meta = {};
      if (session.payment_intent) {
        try {
          const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
          meta = pi.metadata || {};
        } catch (err) {
          console.error('Failed to retrieve payment intent:', err);
        }
      }

      if (!meta.renterName && session.metadata) {
        meta = { ...session.metadata, ...meta };
      }

      // ─── GUARD: skip non-booking payments ────────────────────────────────
      const hasBookingMetadata = !!(meta.packageName || meta.package);
      if (!hasBookingMetadata) {
        console.log('[webhook] Skipping non-booking payment:', session.id, '— no package metadata');
        return NextResponse.json({ received: true, skipped: 'non-booking-payment' });
      }
      // ─────────────────────────────────────────────────────────────────────

      const booking = {
        booking_id: session.id,
        package: meta.packageName || meta.package || '',
        location: meta.location || '',
        start_date: meta.startDate || meta.start_date || '',
        end_date: meta.endDate || meta.end_date || '',
        days: meta.days || '',
        total_price: (session.amount_total / 100).toString(),
        deposit_paid: (session.amount_total / 100).toString(),
        renter_name: meta.renterName || meta.renter_name || '',
        renter_email: meta.renterEmail || meta.renter_email || session.customer_email || '',
        renter_phone: meta.renterPhone || meta.renter_phone || '',
        experience: meta.experience || '',
        sms_consent: meta.smsOptIn === 'true' || meta.sms_consent === 'true',
        white_glove: meta.white_glove === 'true' || meta.whiteGlove === 'true',
        white_glove_fee: parseInt(meta.white_glove_fee || meta.whiteGloveFee || '0', 10),
        is_lake_powell: meta.is_lake_powell === 'true' || meta.isLakePowell === 'true',
        // Life vest fields (NEW)
        vest_summary: meta.vestSummary || meta.vest_summary || '',
        vest_used_default: meta.vest_used_default === 'true' || meta.vestUsedDefault === 'true',
        // Spare vest fee (2026-06-06)
        spare_vest_count: parseInt(meta.spare_vest_count || meta.spareVestCount || '0', 10),
        extra_vest_fee: parseInt(meta.extra_vest_fee || meta.extraVestFee || '0', 10),
        // Pickup & return times (2026-06-02 PM)
        // Both internal (24h "HH:MM") and display (12h "8:00 AM") forms stored.
        // Falls back to historical defaults for pre-feature bookings.
        pickup_time: meta.pickup_time || meta.pickupTime || '08:00',
        return_time: meta.return_time || meta.returnTime || '20:00',
        pickup_time_display: meta.pickup_time_display || meta.pickupTimeDisplay || '8:00 AM',
        return_time_display: meta.return_time_display || meta.returnTimeDisplay || '8:00 PM',
        // ── Rental Agreement (Phase 2) ──
        rental_agreement_signed: meta.agreement_signed === 'true' || meta.agreementSigned === 'true',
        rental_agreement_version: meta.agreement_version || meta.agreementVersion || '',
        rental_agreement_signed_at: meta.agreement_signed_at || meta.agreementSignedAt || '',
      };

      // Write to Google Sheets
      try {
        await addBooking(booking);
        console.log('Booking added to sheet:', booking.booking_id);
      } catch (sheetErr) {
        console.error('Sheet error (non-fatal):', sheetErr.message);
      }

      // Create Google Calendar event
      try {
        await createBookingEvent(booking);
        console.log('Calendar event created:', booking.booking_id);
      } catch (calErr) {
        console.error('Calendar error (non-fatal):', calErr.message);
      }

      // Send SMS confirmation to renter — only if they opted in (TCR compliance)
      try {
        if (booking.renter_phone && booking.sms_consent) {
          const smsBody = buildBookingConfirmationSMS(booking);
          await sendSMS(booking.renter_phone, smsBody);
          console.log('SMS sent to renter:', booking.renter_phone);
        } else if (booking.renter_phone) {
          console.log('SMS not sent — renter did not opt in:', booking.renter_phone);
        }
      } catch (smsErr) {
        console.error('SMS error (non-fatal):', smsErr.message);
      }

      // Send SMS alert to owner team — includes white-glove fee + Lake Powell flags + vests
      try {
        const ownerPhones = (process.env.OWNER_PHONE_NUMBER || '').split(',').map(p => p.trim()).filter(Boolean);
        if (ownerPhones.length > 0) {
          const flags = [];
          if (booking.white_glove) {
            const feeSuffix = booking.white_glove_fee > 0 ? ` ($${booking.white_glove_fee})` : '';
            flags.push(`🤝 WHITE GLOVE${feeSuffix}`);
          }
          if (booking.is_lake_powell) flags.push('🦠 LAKE POWELL');
          const flagPrefix = flags.length > 0 ? ` ${flags.join(' ')}` : '';

          const dateLine = booking.end_date && booking.end_date !== booking.start_date
            ? `${booking.start_date} → ${booking.end_date}`
            : booking.start_date;

          const ownerLines = [
            `🛎️ New booking!${flagPrefix}`,
            booking.package,
            booking.location,
            dateLine,
            `⏰ ${booking.pickup_time_display} → ${booking.return_time_display}`,
            `Renter: ${booking.renter_name} (${booking.renter_phone})`,
            `Paid: $${booking.total_price}`,
          ];

          // Add life vest line (NEW). Note "(default)" suffix if customer skipped section.
          // Adds "+$X spares" tag when at least one spare vest was purchased.
          if (booking.vest_summary) {
            let suffix = booking.vest_used_default ? ' (default)' : '';
            if (booking.extra_vest_fee > 0) {
              suffix += ` +$${booking.extra_vest_fee} spares`;
            }
            ownerLines.push(`🦺 ${booking.vest_summary}${suffix}`);
          }

          // Lake Powell reminder
          if (booking.is_lake_powell) {
            ownerLines.push('🦠 Decon at return — Willard Bay');
          }

          const ownerMsg = ownerLines.join('\n');

          for (const phone of ownerPhones) {
            await sendSMS(phone, ownerMsg);
            console.log('SMS sent to owner:', phone);
          }
        }
      } catch (smsErr) {
        console.error('Owner SMS error (non-fatal):', smsErr.message);
      }

      await sendConfirmationEmail(booking);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
