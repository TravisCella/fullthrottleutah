// app/api/admin/create-deposit-hold/route.js
// Version: 2026-06-06 — Initial deposit hold endpoint
//
// Creates a Stripe Checkout Session with `payment_intent_data.capture_method: 'manual'`
// so the customer enters their card on Stripe's hosted page, and the resulting
// PaymentIntent is in `requires_capture` state — i.e. an authorization hold,
// not a charge. The hold sits there for 7 days (Stripe's standard window) until
// Travis either captures it (because of damage) or cancels it (releases funds
// back to the customer) via the Stripe Dashboard.
//
// Why Checkout Session over Stripe Elements:
//   • Zero npm dependencies — fully hosted by Stripe
//   • Apple Pay + Google Pay supported automatically
//   • The session URL is shareable — Travis can text/email it to the customer
//     so they enter the card on their own device
//   • PCI compliance handled by Stripe
//
// Auth: matches the /admin/reviews pattern — sessionStorage 'ftu_admin_pass'
//       sent in the request body, server compares to ADMIN_PASSWORD env var.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const data = await request.json();
    const { password, customerName, customerEmail, bookingId, notes, amount } = data;

    // ─── Auth ────────────────────────────────────────────────────────────
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Validate inputs ─────────────────────────────────────────────────
    if (!customerName || !customerName.trim()) {
      return Response.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const parsedAmount = parseFloat(amount);
    const amountDollars = isNaN(parsedAmount) || parsedAmount <= 0 ? 1000 : parsedAmount;
    const amountCents = Math.round(amountDollars * 100);

    if (amountCents < 50 || amountCents > 1000000) {
      return Response.json({ error: 'Amount must be between $0.50 and $10,000' }, { status: 400 });
    }

    // ─── Build metadata ──────────────────────────────────────────────────
    // type='manual_deposit_hold' makes these findable later via the
    // list-deposit-holds endpoint and discoverable in Stripe Dashboard.
    const meta = {
      type: 'manual_deposit_hold',
      customer_name: customerName.trim().slice(0, 100),
      customer_email: (customerEmail || '').trim().slice(0, 100),
      linked_booking_id: (bookingId || '').trim().slice(0, 100),
      notes: (notes || '').trim().slice(0, 500),
      created_by: 'admin',
      created_at: new Date().toISOString(),
    };

    // ─── Create the Checkout Session ─────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Full Throttle Utah — Security Deposit Hold',
              description:
                `Refundable authorization hold for ${meta.customer_name}. ` +
                `Your card will NOT be charged unless damage is documented after your rental. ` +
                `The hold automatically releases within 7 days.`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        capture_method: 'manual', // ← the critical flag — this makes it an auth-only hold
        metadata: meta,
        description:
          `Deposit hold — ${meta.customer_name}` +
          (meta.linked_booking_id ? ` (booking ${meta.linked_booking_id.slice(-8)})` : ''),
        statement_descriptor_suffix: 'DEPOSIT', // shown on customer's card statement
      },
      metadata: meta,
      customer_email: meta.customer_email || undefined,
      success_url: `https://www.fullthrottleutah.com/deposit-hold-confirmed?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://www.fullthrottleutah.com/admin/hold-deposit?cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // session URL valid for 24h
    });

    console.log(
      `[create-deposit-hold] Created session ${session.id} for ${meta.customer_name} ($${amountDollars})`
    );

    return Response.json({
      ok: true,
      sessionId: session.id,
      url: session.url,
      amount: amountDollars,
      customerName: meta.customer_name,
      expiresAt: session.expires_at,
    });
  } catch (err) {
    console.error('[create-deposit-hold] error:', err);
    return Response.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
