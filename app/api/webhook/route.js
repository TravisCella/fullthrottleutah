import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const body = await request.json();
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
      loyaltyDiscount,
    } = body;

    // Build a clear product description that reflects what was actually booked
    const wgFlag = whiteGlove ? ' · 🤝 White Glove Delivery' : '';
    const productDescription = `${packageTagline} | ${location}${wgFlag} | ${startDate}${endDate !== startDate ? ' → ' + endDate : ''} | Pickup 8AM – Return 8PM`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: renterEmail,
      // Save the payment method so we can later place a $1000 hold for the security deposit
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          // All booking fields go in payment_intent.metadata so the webhook can read them
          packageName: packageName || '',
          package: packageName || '',
          location: location || '',
          startDate: startDate || '',
          endDate: endDate || '',
          start_date: startDate || '',
          end_date: endDate || '',
          days: String(days || 1),
          totalPrice: String(totalPrice || 0),
          total_price: String(totalPrice || 0),
          renterName: renterName || '',
          renter_name: renterName || '',
          renterEmail: renterEmail || '',
          renter_email: renterEmail || '',
          renterPhone: renterPhone || '',
          renter_phone: renterPhone || '',
          experience: experience || '',
          smsOptIn: smsOptIn ? 'true' : 'false',
          sms_consent: smsOptIn ? 'true' : 'false',
          // White-glove and pricing detail fields
          white_glove: whiteGlove ? 'true' : 'false',
          whiteGlove: whiteGlove ? 'true' : 'false',
          holiday_surcharge: String(holidaySurcharge || 0),
          decon_fee: String(deconFee || 0),
          is_lake_powell: isLakePowell ? 'true' : 'false',
          loyalty_discount: String(loyaltyDiscount || 0),
          // Waiver fields
          waiver_signed: waiverSigned || 'false',
          waiver_signed_date: waiverDate || '',
        },
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${packageName} — ${days} Day${days > 1 ? 's' : ''} Rental${whiteGlove ? ' (White Glove)' : ''}`,
              description: productDescription,
            },
            // Charge full rental amount up front (not deposit)
            unit_amount: Math.round(totalPrice * 100),
          },
          quantity: 1,
        },
      ],
      // Also include metadata at session level for compatibility
      metadata: {
        package: packageName || '',
        location: location || '',
        startDate: startDate || '',
        endDate: endDate || '',
        days: String(days || 1),
        total_price: String(totalPrice || 0),
        renter_name: renterName || '',
        renter_email: renterEmail || '',
        renter_phone: renterPhone || '',
        experience: experience || '',
        white_glove: whiteGlove ? 'true' : 'false',
      },
      success_url: `${request.headers.get('origin')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin')}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
