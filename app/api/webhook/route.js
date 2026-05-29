import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addBooking } from '../../../lib/sheets';
import { createBookingEvent } from '../../../lib/calendar';
import { sendSMS, buildBookingConfirmationSMS, buildOwnerNotificationSMS } from '../../../lib/sms';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function sendConfirmationEmail(booking) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.log('No Resend API key, skipping email');
    return;
  }

  // White-glove customers get different pickup instructions
  const pickupSection = booking.white_glove ? `
              <div style="background: #DCFCE7; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #16A34A;">
                <strong style="color: #15803D;">🤝 White Glove Delivery Confirmed</strong>
                <p style="color: #166534; margin: 8px 0 0 0; font-size: 14px; line-height: 1.5;">
                  We'll deliver the watercraft to your chosen lake, launch it for you, and pick it up when you're done. We'll reach out to confirm delivery time and location closer to your rental date.
                </p>
              </div>

              <div style="background: #FEF3C7; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <strong style="color: #92400E;">Before Your Rental:</strong>
                <ol style="color: #92400E; margin: 8px 0; padding-left: 20px; font-size: 14px;">
                  <li>We'll text/call to confirm delivery time and location</li>
                  <li>Bring valid driver's license</li>
                  <li>Bring $1,000 security deposit (card hold or cash)</li>
                  <li>No tow vehicle needed — we handle delivery and launch</li>
                </ol>
              </div>
  ` : `
              <div style="background: #FEF3C7; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <strong style="color: #92400E;">Before Your Rental:</strong>
                <ol style="color: #92400E; margin: 8px 0; padding-left: 20px; font-size: 14px;">
                  <li>Arrive at Farmington pickup point by 8:00 AM</li>
                  <li>Bring valid driver's license</li>
                  <li>Bring a vehicle with a 2" ball hitch and flat 4-prong light hookup</li>
                  <li>Bring $1,000 security deposit (card hold or cash)</li>
                </ol>
              </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: 'Full Throttle Utah <onboarding@resend.dev>',
        to: booking.renter_email,
        subject: `Booking Confirmed — ${booking.package}${booking.white_glove ? ' (White Glove)' : ''} | Full Throttle Utah`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #0C4A6E; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 24px;">Booking Confirmed!</h1>
              ${booking.white_glove ? '<p style="color: #BAE6FD; margin: 8px 0 0; font-size: 14px;">🤝 White Glove Delivery</p>' : ''}
            </div>
            <div style="padding: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
              <p>Hi ${booking.renter_name},</p>
              <p>Your reservation with Full Throttle Utah is confirmed. Here are your details:</p>
              
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Package</td><td style="padding: 8px; font-weight: 600;">${booking.package}</td></tr>
                <tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Location</td><td style="padding: 8px; font-weight: 600;">${booking.location}</td></tr>
                <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Dates</td><td style="padding: 8px; font-weight: 600;">${booking.start_date}${booking.end_date !== booking.start_date ? ' → ' + booking.end_date : ''}</td></tr>
                <tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Days</td><td style="padding: 8px; font-weight: 600;">${booking.days}</td></tr>
                ${booking.white_glove ? '<tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Service</td><td style="padding: 8px; font-weight: 600; color: #16A34A;">🤝 White Glove Delivery</td></tr>' : ''}
                <tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Rental Paid in Full</td><td style="padding: 8px; font-weight: 600; color: #16a34a;">$${booking.total_price}</td></tr>
                <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Due at Pickup</td><td style="padding: 8px; font-weight: 700; font-size: 16px;">$1,000 security deposit</td></tr>
              </table>

              ${pickupSection}

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
      
      // Get the payment intent to access the metadata (new flow stores it there)
      let meta = {};
      if (session.payment_intent) {
        try {
          const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
          meta = pi.metadata || {};
        } catch (err) {
          console.error('Failed to retrieve payment intent:', err);
        }
      }
      
      // Fall back to session metadata if needed (for legacy compatibility)
      if (!meta.renterName && session.metadata) {
        meta = { ...session.metadata, ...meta };
      }

      const booking = {
        booking_id: session.id,
        // Support both new (camelCase) and old (snake_case) field names
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
        white_glove: meta.white_glove === 'true',
        holiday_surcharge: parseInt(meta.holiday_surcharge || '0', 10),
        loyalty_discount: parseInt(meta.loyalty_discount || '0', 10),
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

      // Send SMS alert to owner — uses the new buildOwnerNotificationSMS template
      // which includes white-glove indicator, holiday surcharge, and loyalty discount flags
      try {
        const ownerPhone = process.env.OWNER_PHONE_NUMBER;
        if (ownerPhone) {
          const ownerMsg = buildOwnerNotificationSMS(booking);
          await sendSMS(ownerPhone, ownerMsg);
          console.log('SMS sent to owner:', ownerPhone);
        }
      } catch (smsErr) {
        console.error('Owner SMS error (non-fatal):', smsErr.message);
      }

      // Send confirmation email
      await sendConfirmationEmail(booking);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
