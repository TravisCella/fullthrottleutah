 // Force rebuild 2026-05-28
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
      holidaySurcharge,
      deconFee,
      isLakePowell,
      waiverSigned,
      waiverDate,
    } = data;

    // Charge 100% of rental upfront
    const fullAmount = Math.round(totalPrice * 100); // Stripe uses cents

    // Create or retrieve customer
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
          renterName,
          renterEmail,
          renterPhone,
          packageName,
          location,
          startDate,
          white_glove: whiteGlove ? 'true' : 'false',
        holiday_surcharge: String(holidaySurcharge || 0),
        loyalty_discount: String(body.loyaltyDiscount || 0),
          endDate,
          days: days?.toString() || '1',
          experience: experience || '',
          smsOptIn: smsOptIn ? 'true' : 'false',
          smsOptInDate: smsOptIn ? new Date().toISOString() : '',
          whiteGlove: whiteGlove ? 'true' : 'false',
          holidaySurcharge: holidaySurcharge?.toString() || '0',
          deconFee: deconFee?.toString() || '0',
          isLakePowell: isLakePowell ? 'true' : 'false',
          waiverSigned: waiverSigned || 'false',
          waiverDate: waiverDate || '',
          securityDepositStatus: 'pending',
          rentalStatus: 'booked',
        },
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: packageName,
              description: `${packageTagline} · ${location} · ${days} day${days > 1 ? 's' : ''} (${startDate}${endDate !== startDate ? ` - ${endDate}` : ''})`,
            },
            unit_amount: fullAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${request.headers.get('origin') || 'https://www.fullthrottleutah.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin') || 'https://www.fullthrottleutah.com'}/`,
      customer_email: undefined,
    });

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
