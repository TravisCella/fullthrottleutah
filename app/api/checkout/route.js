import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const body = await request.json();
    const { packageName, packageTagline, totalPrice, depositAmount, days, startDate, endDate, location, renterName, renterEmail, renterPhone, experience, waiverSigned, waiverDate, smsConsent } = body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: renterEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${packageName} — ${days} Day${days > 1 ? 's' : ''} Rental`,
              description: `${packageTagline} | ${location} | ${startDate}${endDate !== startDate ? ' → ' + endDate : ''} | Pickup 8AM – Return 8PM`,
            },
            unit_amount: depositAmount * 100, // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        package: packageName,
        total_price: String(totalPrice),
        deposit_amount: String(depositAmount),
        days: String(days),
        start_date: startDate,
        end_date: endDate,
        location: location,
        renter_name: renterName,
        renter_email: renterEmail,
        renter_phone: renterPhone,
        experience: experience,
        waiver_signed: waiverSigned || 'false',
        waiver_signed_date: waiverDate || '',
        sms_consent: smsConsent ? 'true' : 'false',
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
