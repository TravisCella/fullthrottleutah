// app/api/admin/refund-deposit/route.js
// Version: 2026-06-01 — Direct metadata + graceful state mismatch handling
// Last edited: June 1 2026
//
// Changes vs prior version:
//   1. After a successful release OR capture, this endpoint now writes the FULL set of
//      status metadata back to the PaymentIntent (rentalStatus, securityDepositStatus,
//      returnTimestamp, etc.). Previously the admin app called update-booking as a
//      separate follow-up — if that follow-up failed (network blip, timeout), the
//      booking would stay stuck in "OUT · CARD HOLD" status even though Stripe had
//      released the hold. The Leonardo issue from June 1 was a downstream symptom of
//      this. Doing it inline removes the two-step dependency.
//
//   2. Graceful recovery when the Stripe PaymentIntent is already in the target state
//      (e.g., Travis canceled or captured it in the Stripe Dashboard directly). Instead
//      of returning a raw Stripe error like "You cannot cancel this PaymentIntent
//      because it has a status of canceled", the endpoint detects this, treats it as
//      success, updates the metadata accordingly, and returns ok. The admin app's
//      client-side now expects this behavior.

import Stripe from 'stripe';
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
// Used by both the success path and the recovery path so behavior is consistent.
async function writeReturnMetadata(piId, { action, damageReason, capturedAmount, externalAction }) {
  const pi = await stripe.paymentIntents.retrieve(piId);
  const updates = { ...pi.metadata };

  // Always set on a return — clean OR damage
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
    // Flag that the underlying Stripe action happened outside the admin app
    updates.externalStripeAction = 'true';
    updates.externalStripeActionAt = new Date().toISOString();
  }

  await stripe.paymentIntents.update(piId, { metadata: updates });
  return updates;
}

export async function POST(request) {
  try {
    const { holdId, action, captureAmount, damageReason, password } = await request.json();

    // Auth check
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
          // Hold was already released (likely in Stripe Dashboard).
          // Fetch current state, mark rental returned, return success.
          result = await stripe.paymentIntents.retrieve(holdId);
          externalAction = true;
        } else if (state === 'already_captured') {
          // Hold was already captured externally. We can't "release" a captured hold,
          // but we should still mark the rental complete so it doesn't stay stuck.
          result = await stripe.paymentIntents.retrieve(holdId);
          // Tell the caller this is a different state than what they asked for
          await writeReturnMetadata(holdId, {
            action: 'capture',
            capturedAmount: result.amount_received / 100,
            damageReason: 'Captured in Stripe Dashboard',
            externalAction: true,
          });
          return Response.json({
            success: true,
            action: 'capture', // tell caller the real outcome
            holdId: result.id,
            status: result.status,
            amount: result.amount / 100,
            capturedAmount: result.amount_received / 100,
            note: 'Hold was already captured externally (not released). Rental marked complete.',
            externalAction: true,
          });
        } else {
          // Real error — bubble up
          throw err;
        }
      }

      // Write metadata (booking now marked returned)
      await writeReturnMetadata(holdId, { action: 'release', externalAction });

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
        // Capture happened externally — just confirm and mark complete.
        result = await stripe.paymentIntents.retrieve(holdId);
        externalAction = true;
      } else if (state === 'already_canceled') {
        // The hold is gone — can't capture from it. This is a real problem
        // (Travis wanted to charge damage but lost the hold). Return a clear error
        // so the admin UI can tell him to charge the saved card directly.
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

    // Write metadata (booking marked returned + damage details)
    const finalCapturedAmount = externalAction
      ? result.amount_received / 100
      : amountToCapture / 100;

    await writeReturnMetadata(holdId, {
      action: 'capture',
      damageReason: externalAction ? 'Captured in Stripe Dashboard' : damageReason,
      capturedAmount: finalCapturedAmount,
      externalAction,
    });

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
