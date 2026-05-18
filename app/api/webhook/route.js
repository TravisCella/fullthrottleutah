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
                <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Deposit Paid</td><td style="padding: 8px; font-weight: 600; color: #16a34a;">$${booking.deposit_paid}</td></tr>
                <tr style="background: #fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Due at Pickup</td><td style="padding: 8px; font-weight: 700; font-size: 16px;">$${Number(booking.total_price) - Number(booking.deposit_paid) + 1000}</td></tr>
              </table>

              <div style="background: #FEF3C7; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <strong style="color: #92400E;">Before Your Rental:</strong>
                <ol style="color: #92400E; margin: 8px 0; padding-left: 20px; font-size: 14px;">
                  <li>Arrive at Farmington pickup point by 8:00 AM</li>
                  <li>Bring valid driver's license and proof of insurance</li>
                  <li>Bring a vehicle with a 2" ball hitch and flat 4-prong light hookup</li>
                  <li>Pay remaining balance + $1,000 security deposit at pickup</li>
                </ol>
              </div>

              <p style="font-size: 13px; color: #64748b;">Questions? Reply to this email or call/text us.</p>
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
      const meta = session.metadata || {};

      const booking = {
        booking_id: session.id,
        package: meta.package || '',
        location: meta.location || '',
        start_date: meta.start_date || '',
        end_date: meta.end_date || '',
        days: meta.days || '',
        total_price: meta.total_price || '',
        deposit_paid: meta.deposit_amount || '',
        renter_name: meta.renter_name || '',
        renter_email: meta.renter_email || session.customer_email || '',
        renter_phone: meta.renter_phone || '',
        experience: meta.experience || '',
      };

      // Write to Google Sheets
      await addBooking(booking);
      console.log('Booking added to sheet:', booking.booking_id);

      // Create Google Calendar event
      try {
        await createBookingEvent(booking);
        console.log('Calendar event created:', booking.booking_id);
      } catch (calErr) {
        console.error('Calendar error (non-fatal):', calErr.message);
      }

      // Send SMS confirmation to renter
      try {
        if (booking.renter_phone) {
          const smsBody = buildBookingConfirmationSMS(booking);
          await sendSMS(booking.renter_phone, smsBody);
          console.log('SMS sent to renter:', booking.renter_phone);
        }
      } catch (smsErr) {
        console.error('SMS error (non-fatal):', smsErr.message);
      }

      // Send SMS alert to owner
      try {
        const ownerPhone = process.env.OWNER_PHONE_NUMBER;
        if (ownerPhone) {
          const ownerMsg = `🛎️ New booking!\n${booking.package}\n${booking.location}\n${booking.start_date}\nRenter: ${booking.renter_name} (${booking.renter_phone})\nDeposit: $${booking.deposit_paid}`;
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
