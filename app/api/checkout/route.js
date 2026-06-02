// app/api/checkout/route.js
// Version: 2026-06-02 — Pass life vest selection through to Stripe metadata
// Last edited: June 2 2026
// Feature: Receives vestSizes (JSON string of {size: count}), vestSummary
//          (human-readable string like "1 Adult XXL, 1 Adult M (2 vests)"), and
//          vestUsedDefault (boolean — true if the customer skipped the section
//          and we filled in 2 Adult Mediums automatically). All forwarded to
//          payment_intent.metadata in both camelCase and snake_case for
//          downstream consumption by the webhook.
//
// Builds on: api-checkout-route_2026-05-30_pass-whiteglovefee.js
// Downstream: app/api/webhook/route.js (file 3 of 3) reads vest_summary from
//             metadata for owner SMS, customer email, and Google Sheet column S.

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
