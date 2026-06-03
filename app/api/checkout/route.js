// app/api/checkout/route.js
// Version: 2026-06-02 PM — Pass pickup & return times through to Stripe metadata
// Last edited: June 2 2026 (evening)
// Feature: Receives pickupTime + returnTime (24-hr "HH:MM" strings) and their
//          display equivalents from booking.js, and writes both formats to
//          payment_intent.metadata (camelCase + snake_case) so the webhook can
//          surface them in SMS, email, Sheet, and the 24-hr reminder.
//
// Builds on: 2026-06-02 vest data passthrough

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const data = await request.json();

    const {
      packageName,
      packageTagline,
      totalPrice,
      days,
      startDate,
      endDate,
      location,
      renterName,
      renterEmail,
      renterPhone,
      experience,
      smsOptIn,
      whiteGlove,
      whiteGloveFee,
      holidaySurcharge,
      deconFee,
      isLakePowell,
      loyaltyDiscount,
      vestSizes,        // JSON string of {size_key: count}
      vestSummary,      // Human-readable string
      vestUsedDefault,  // true if customer skipped and we defaulted
      pickupTime,        // 24-hr internal format "HH:MM" (e.g. "08:00")
      returnTime,        // 24-hr internal format "HH:MM" (e.g. "20:00")
      pickupTimeDisplay, // 12-hr display string (e.g. "8:00 AM")
      returnTimeDisplay, // 12-hr display string (e.g. "8:00 PM")
      waiverSigned,
      waiverDate,
    } = data;

    const fullAmount = Math.round(totalPrice * 100);

    let customer;
    const existingCustomers = await stripe.customers.list({ email: renterEmail, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: renterEmail,
        name: renterName,
        phone: renterPhone,
        metadata: {
          experience: experience || '',
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer: customer.id,
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          // Renter info
          renterName,
          renterEmail,
          renterPhone,
          experience: experience || '',
          // Booking details
          packageName,
          location,
          startDate,
          endDate,
          days: days?.toString() || '1',
          // Pricing detail flags
          whiteGlove: whiteGlove ? 'true' : 'false',
          white_glove: whiteGlove ? 'true' : 'false',
          whiteGloveFee: whiteGloveFee?.toString() || '0',
          white_glove_fee: (whiteGloveFee || 0).toString(),
          holidaySurcharge: holidaySurcharge?.toString() || '0',
          holiday_surcharge: (holidaySurcharge || 0).toString(),
          deconFee: deconFee?.toString() || '0',
          decon_fee: (deconFee || 0).toString(),
          isLakePowell: isLakePowell ? 'true' : 'false',
          is_lake_powell: isLakePowell ? 'true' : 'false',
          loyaltyDiscount: loyaltyDiscount?.toString() || '0',
          loyalty_discount: (loyaltyDiscount || 0).toString(),
          // Life vest selection (NEW)
          vestSizes: vestSizes || '',
          vest_sizes: vestSizes || '',
          vestSummary: vestSummary || '',
          vest_summary: vestSummary || '',
          vestUsedDefault: vestUsedDefault ? 'true' : 'false',
          vest_used_default: vestUsedDefault ? 'true' : 'false',
          // Pickup & return times (2026-06-02 PM)
          pickupTime: pickupTime || '08:00',
          pickup_time: pickupTime || '08:00',
          returnTime: returnTime || '20:00',
          return_time: returnTime || '20:00',
          pickupTimeDisplay: pickupTimeDisplay || '8:00 AM',
          pickup_time_display: pickupTimeDisplay || '8:00 AM',
          returnTimeDisplay: returnTimeDisplay || '8:00 PM',
          return_time_display: returnTimeDisplay || '8:00 PM',
          // SMS consent (TCPA tracking)
          smsOptIn: smsOptIn ? 'true' : 'false',
          smsOptInDate: smsOptIn ? new Date().toISOString() : '',
          // Waiver tracking
          waiverSigned: waiverSigned || 'false',
          waiverDate: waiverDate || '',
          // Status flags for admin dashboard
          securityDepositStatus: 'pending',
          rentalStatus: 'booked',
        },
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${packageName}${whiteGlove && whiteGloveFee > 0 ? ` (White Glove $${whiteGloveFee})` : whiteGlove ? ' (White Glove)' : ''}`,
              description: `${packageTagline} · ${location} · ${days} day${days > 1 ? 's' : ''} (${startDate}${endDate !== startDate ? ` - ${endDate}` : ''})`,
            },
            unit_amount: fullAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${request.headers.get('origin') || 'https://www.fullthrottleutah.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin') || 'https://www.fullthrottleutah.com'}/`,
    });

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
