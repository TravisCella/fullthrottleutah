import Stripe from 'stripe';
import { cancelBookingInSheet } from '../../../../lib/sheets';

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
      expand: ['payment_intent'],
    });

    const pi = session.payment_intent;
    if (!pi) {
      return Response.json({ error: 'No payment intent found for this session' }, { status: 400 });
    }

    const meta = pi.metadata || {};

    if (meta.rentalStatus === 'picked_up') {
      return Response.json(
        { error: 'Cannot cancel a rental that has already been picked up. Release the deposit hold instead.' },
        { status: 400 }
      );
    }
    if (meta.rentalStatus === 'returned') {
      return Response.json(
        { error: 'Cannot cancel a completed rental.' },
        { status: 400 }
      );
    }
    if (meta.rentalStatus === 'cancelled') {
      return Response.json({ error: 'Booking is already cancelled.' }, { status: 400 });
    }

    // Issue a full refund on the original booking payment.
    let refund;
    try {
      refund = await stripe.refunds.create({
        payment_intent: pi.id,
        reason: 'requested_by_customer',
      });
    } catch (refundErr) {
      console.error('[cancel-booking] Stripe refund failed:', refundErr.message);
      return Response.json({ error: `Refund failed: ${refundErr.message}` }, { status: 400 });
    }

    // Mark the PI metadata as cancelled.
    await stripe.paymentIntents.update(pi.id, {
      metadata: {
        ...meta,
        rentalStatus: 'cancelled',
        cancelledAt: new Date().toISOString(),
      },
    });

    // Mark the Sheets row as CANCELLED to free the dates in the booking wizard.
    // Best-effort — if the webhook hasn't written to Sheets yet, found=false is
    // logged but doesn't fail the cancellation (Stripe refund already succeeded).
    const email     = meta.renterEmail || '';
    const startDate = meta.startDate   || '';
    let sheetResult = { found: false };
    try {
      sheetResult = await cancelBookingInSheet(email, startDate);
      if (!sheetResult.found) {
        console.warn(
          `[cancel-booking] Sheets row not found for email=${email} startDate=${startDate}. ` +
          'Booking may not have been written to Sheets yet — mark manually if needed.'
        );
      }
    } catch (sheetErr) {
      console.error('[cancel-booking] Sheets update failed:', sheetErr.message);
    }

    return Response.json({
      success: true,
      refundId: refund.id,
      amountRefunded: refund.amount / 100,
      sheetUpdated: sheetResult.found,
    });
  } catch (err) {
    console.error('[cancel-booking] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
