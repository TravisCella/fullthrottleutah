// app/api/admin/refund-deposit/route.js
// Version: 2026-06-02 — Auto-fire review request email after return
// Last edited: June 2 2026
//
// Change from prior version:
//   After successfully marking a rental as returned (release path OR capture path),
//   fire the review request email via lib/review-email.js. Fire-and-forget — never
//   blocks the return action. Idempotent — review-email.js will skip if already sent.
//
// Prior version's behavior (graceful state handling, direct metadata writes) preserved.

import Stripe from 'stripe';
import { sendReviewRequest } from '../../../../lib/review-email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Detect Stripe state-mismatch errors so we can recover gracefully.
function classifyStripeStateError(err) {
  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('status of canceled') || msg.includes('status of `canceled`')) {
    return 'already_canceled';
  }
  if (
    msg.includes('status of succeeded') ||
    msg.includes('status of `succeeded`') ||
    msg.includes('already been captured')
  ) {
    return 'already_captured';
  }
  return null;
}

// Write the full set of "rental returned" metadata onto a PaymentIntent in one call.
async function writeReturnMetadata(piId, { action, damageReason, capturedAmount, externalAction }) {
  const pi = await stripe.paymentIntents.retrieve(piId);
  const updates = { ...pi.metadata };

  updates.rentalStatus = 'returned';
  updates.returnTimestamp = new Date().toISOString();

  if (action === 'release') {
    updates.securityDepositStatus = 'released';
    updates.returnNotes = updates.returnNotes || 'Clean return — hold released';
  } else if (action === 'capture') {
    updates.securityDepositStatus = 'captured';
    if (damageReason) updates.damageReason = damageReason;
    if (capturedAmount != null) updates.capturedAmount = String(capturedAmount);
    updates.captureTimestamp = new Date().toISOString();
    updates.returnNotes = updates.returnNotes || `Damage: ${damageReason || 'Not specified'} ($${capturedAmount || 0})`;
  }

  if (externalAction) {
    updates.externalStripeAction = 'true';
    updates.externalStripeActionAt = new Date().toISOString();
  }

  await stripe.paymentIntents.update(piId, { metadata: updates });
  return updates;
}

// Find the ORIGINAL booking PaymentIntent ID from the security-deposit hold's metadata.
// The hold's metadata has originalCheckoutSession (the Stripe Checkout Session ID).
// We need the PaymentIntent attached to that session, since that's where the booking
// metadata (renterEmail, packageName, etc.) lives.
async function findOriginalBookingPI(hold) {
  const sessionId = hold?.metadata?.originalCheckoutSession;
  if (!sessionId) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });
    return session.payment_intent?.id || null;
  } catch (err) {
    console.warn('[refund-deposit] Could not find original booking PI:', err.message);
    return null;
  }
}

// Fire review email — fire-and-forget, never throws into the caller.
function fireReviewRequestForBooking(originalBookingPiId) {
  if (!originalBookingPiId) {
    console.log('[refund-deposit] No original booking PI ID, skipping review email');
    return;
  }
  // Don't await — we don't want email latency or failure to affect the return action
  sendReviewRequest(originalBookingPiId).catch(err => {
    console.error('[refund-deposit] Review email fire-and-forget failed:', err.message);
  });
}

export async function POST(request) {
  try {
    const { holdId, action, captureAmount, damageReason, password } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!holdId) {
      return Response.json({ error: 'Missing holdId' }, { status: 400 });
    }
    if (!action || !['release', 'capture'].includes(action)) {
      return Response.json({ error: 'Action must be "release" or "capture"' }, { status: 400 });
    }

    // ─── RELEASE FLOW ─────────────────────────────────────────────────────────
    if (action === 'release') {
      let result;
      let externalAction = false;

      try {
        result = await stripe.paymentIntents.cancel(holdId);
      } catch (err) {
        const state = classifyStripeStateError(err);

        if (state === 'already_canceled') {
          result = await stripe.paymentIntents.retrieve(holdId);
          externalAction = true;
        } else if (state === 'already_captured') {
          result = await stripe.paymentIntents.retrieve(holdId);
          await writeReturnMetadata(holdId, {
            action: 'capture',
            capturedAmount: result.amount_received / 100,
            damageReason: 'Captured in Stripe Dashboard',
            externalAction: true,
          });
          // Fire review email for the original booking
          const origPiId = await findOriginalBookingPI(result);
          fireReviewRequestForBooking(origPiId);

          return Response.json({
            success: true,
            action: 'capture',
            holdId: result.id,
            status: result.status,
            amount: result.amount / 100,
            capturedAmount: result.amount_received / 100,
            note: 'Hold was already captured externally (not released). Rental marked complete.',
            externalAction: true,
          });
        } else {
          throw err;
        }
      }

      await writeReturnMetadata(holdId, { action: 'release', externalAction });

      // Fire review email for the original booking
      const origPiId = await findOriginalBookingPI(result);
      fireReviewRequestForBooking(origPiId);

      return Response.json({
        success: true,
        action: 'release',
        holdId: result.id,
        status: result.status,
        amount: result.amount / 100,
        capturedAmount: 0,
        externalAction,
        note: externalAction ? 'Hold was already released externally. Rental marked complete.' : undefined,
      });
    }

    // ─── CAPTURE FLOW ─────────────────────────────────────────────────────────
    const amountToCapture = Math.round((captureAmount || 1000) * 100);

    if (amountToCapture > 100000) {
      return Response.json({ error: 'Cannot capture more than $1,000' }, { status: 400 });
    }
    if (amountToCapture < 100) {
      return Response.json({ error: 'Minimum capture is $1.00' }, { status: 400 });
    }

    let result;
    let externalAction = false;

    try {
      result = await stripe.paymentIntents.capture(holdId, {
        amount_to_capture: amountToCapture,
      });
    } catch (err) {
      const state = classifyStripeStateError(err);

      if (state === 'already_captured') {
        result = await stripe.paymentIntents.retrieve(holdId);
        externalAction = true;
      } else if (state === 'already_canceled') {
        return Response.json(
          {
            error:
              "Hold was already released (likely in Stripe Dashboard). Can't capture from a released hold. To charge for damage, create a new charge in Stripe using the customer's saved card.",
            code: 'hold_already_released',
          },
          { status: 400 }
        );
      } else {
        throw err;
      }
    }

    const finalCapturedAmount = externalAction
      ? result.amount_received / 100
      : amountToCapture / 100;

    await writeReturnMetadata(holdId, {
      action: 'capture',
      damageReason: externalAction ? 'Captured in Stripe Dashboard' : damageReason,
      capturedAmount: finalCapturedAmount,
      externalAction,
    });

    // Fire review email for the original booking
    const origPiId = await findOriginalBookingPI(result);
    fireReviewRequestForBooking(origPiId);

    return Response.json({
      success: true,
      action: 'capture',
      holdId: result.id,
      status: result.status,
      amount: result.amount / 100,
      capturedAmount: finalCapturedAmount,
      externalAction,
      note: externalAction ? 'Hold was already captured externally. Rental marked complete.' : undefined,
    });
  } catch (err) {
    console.error('Refund deposit error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
