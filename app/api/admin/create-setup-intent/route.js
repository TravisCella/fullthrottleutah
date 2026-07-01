// app/api/admin/create-setup-intent/route.js
// Returns a SetupIntent client_secret for the backup-card flow.
//
// Called by the admin UI when an operator taps "Add backup card" after a
// deposit-hold decline. The client uses the client_secret to confirm the
// card via Stripe Elements (card number never touches our server), then
// hands the resulting pm_ to /api/admin/charge-deposit.
//
// SetupIntent usage:'off_session' is required so the saved card can be
// charged later without the cardholder present — matching the capture_method
// used for deposit holds.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const { sessionId, password } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer'],
    });

    const customerId = session.customer?.id || session.customer;
    if (!customerId) {
      return Response.json({ error: 'No customer found on this booking' }, { status: 400 });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
    });

    return Response.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error('[create-setup-intent] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
