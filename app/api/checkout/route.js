// app/api/checkout/route.js
// Version: 2026-05-30 — Forward whiteGloveFee to Stripe metadata
// Last edited: May 30 2026 (afternoon — file 2 of 3 in distance-tiered white-glove rollout)
// Feature: Receives the new whiteGloveFee field from booking.js (the per-destination
//          dollar amount, e.g. $150 Pineview / $450 Bear Lake) and forwards it into
//          Stripe payment_intent metadata as both whiteGloveFee (camelCase) and
//          white_glove_fee (snake_case) for downstream compatibility. Also enhances
//          the Stripe product name to include the fee amount, so "Spark Duo (White
//          Glove $450)" appears in the Stripe dashboard line item — easier visual
//          scanning when reviewing payments.
//
// Builds on: api-checkout-route_2026-05-29_fix-body-undefined.js (yesterday's fix)
// Downstream: app/api/webhook/route.js (file 3 of 3) will read white_glove_fee
//             from this metadata and surface the dollar amount in owner SMS.

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
      waiverSigned,
      waiverDate,
    } = data;

    // Charge 100% of rental upfront (Stripe uses cents)
    const fullAmount = Math.round(totalPrice * 100);

    // Create or retrieve customer so the card is saved for the $1,000 deposit hold at pickup
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
      // CRITICAL: This saves the card for future charges (the $1,000 hold at pickup)
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
              // Include fee amount in product name when present, e.g. "Spark Duo (White Glove $450)"
              // Falls back to plain "(White Glove)" if fee is somehow missing/0 (defensive)
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
