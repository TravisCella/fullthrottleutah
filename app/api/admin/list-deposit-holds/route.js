// app/api/admin/list-deposit-holds/route.js
// Version: 2026-06-06 — Initial
//
// Returns the most recent manual deposit holds so Travis can see what's
// outstanding, what was captured, and what was released. Identifies holds
// by metadata.type='manual_deposit_hold' (set by create-deposit-hold).
//
// Status mapping (Stripe PaymentIntent status → what it means here):
//   requires_payment_method  →  Customer hasn't entered card yet (session active)
//   requires_capture         →  Hold placed, awaiting capture decision
//   succeeded                →  CAPTURED (charged for damages)
//   canceled                 →  RELEASED (refunded to customer)
//
// Auth matches create-deposit-hold: password in body, compared to ADMIN_PASSWORD.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const data = await request.json();
    const { password } = data;

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Pull the last 100 PaymentIntents (~30 days at FTU volume), filter to
    // our deposit-hold subset. Avoids needing Stripe Search API (which has
    // indexing latency). 30 days is a reasonable window for outstanding holds.
    const cutoffTs = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);
    const result = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: cutoffTs },
    });

    const holds = result.data
      .filter(pi => pi.metadata?.type === 'manual_deposit_hold')
      .map(pi => {
        // Compute capture deadline (7 days from creation for manual capture)
        const captureBefore = new Date((pi.created + 7 * 24 * 60 * 60) * 1000).toISOString();

        // Human-friendly status
        let friendlyStatus = pi.status;
        if (pi.status === 'requires_payment_method') friendlyStatus = 'awaiting_card';
        if (pi.status === 'requires_capture') friendlyStatus = 'hold_active';
        if (pi.status === 'succeeded') friendlyStatus = 'captured';
        if (pi.status === 'canceled') friendlyStatus = 'released';

        return {
          id: pi.id,
          status: pi.status,
          friendlyStatus,
          amount: pi.amount / 100,
          currency: pi.currency,
          customerName: pi.metadata?.customer_name || '',
          customerEmail: pi.metadata?.customer_email || pi.receipt_email || '',
          linkedBookingId: pi.metadata?.linked_booking_id || '',
          notes: pi.metadata?.notes || '',
          createdAt: pi.created,
          captureBefore,
          stripeUrl: `https://dashboard.stripe.com/payments/${pi.id}`,
        };
      });

    // Newest first
    holds.sort((a, b) => b.createdAt - a.createdAt);

    return Response.json({ ok: true, holds });
  } catch (err) {
    console.error('[list-deposit-holds] error:', err);
    return Response.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
