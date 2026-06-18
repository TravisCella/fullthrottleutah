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
import { fireReturnNotification } from '../../../../lib/return-notification';

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

// Write "rental returned" status onto the ORIGINAL BOOKING PaymentIntent.
// This is the PI that list-bookings reads — the hold PI (written by writeReturnMetadata)
// is never surfaced in the admin dashboard.
// Non-fatal: the hold operation already succeeded. Log loudly so manual reconciliation
// is possible if this call fails (booking will show "OUT · CARD HOLD" until corrected).
async function writeReturnedToBookingPI(origPiId, { action, capturedAmount, damageReason }) {
  if (!origPiId) {
    console.error(
      '[refund-deposit] writeReturnedToBookingPI: origPiId is null — ' +
        'booking PI rentalStatus NOT updated. Requires manual correction.'
    );
    return;
  }
  try {
    const pi = await stripe.paymentIntents.retrieve(origPiId);
    const updates = { ...pi.metadata };
    updates.rentalStatus = 'returned';
    updates.returnTimestamp = new Date().toISOString();
    if (action === 'release') {
      updates.securityDepositStatus = 'released';
    } else if (action === 'capture') {
      updates.securityDepositStatus = 'captured';
      if (capturedAmount != null) updates.capturedAmount = String(capturedAmount);
      if (damageReason) updates.damageReason = damageReason;
    }
    await stripe.paymentIntents.update(origPiId, { metadata: updates });
    console.log('[refund-deposit] Booking PI rentalStatus → returned:', origPiId);
  } catch (err) {
    console.error(
      `[refund-deposit] FAILED to update booking PI ${origPiId}: ${err.message}. ` +
        'Booking shows OUT·CARD HOLD until manually corrected via update-booking.'
    );
  }
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
    // Normalise: payment_intent is either an expanded object or a bare string ID
    // when Stripe's expand degrades. The old `session.payment_intent?.id` returned
    // undefined on a string, silently dropping the PI ID and skipping notifications.
    const pi = session.payment_intent;
    return (typeof pi === 'string' ? pi : pi?.id) || null;
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
          // Fire review email + return notification for the original booking
          const origPiId = await findOriginalBookingPI(result);
          await writeReturnedToBookingPI(origPiId, {
            action: 'capture',
            capturedAmount: result.amount_received / 100,
          });
          fireReviewRequestForBooking(origPiId);
          fireReturnNotification(result, origPiId, {
            action: 'capture',
            capturedAmount: result.amount_received / 100,
            releasedAmount: (result.amount - result.amount_received) / 100,
            damageReason: null, // external Stripe Dashboard action — no reason to surface
          });

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

      // Fire review email + return notification for the original booking
      const origPiId = await findOriginalBookingPI(result);
      await writeReturnedToBookingPI(origPiId, { action: 'release' });
      fireReviewRequestForBooking(origPiId);
      fireReturnNotification(result, origPiId, {
        action: 'release',
        capturedAmount: 0,
        releasedAmount: result.amount / 100,
      });

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
    const holdPI = await stripe.paymentIntents.retrieve(holdId);
    const maxCaptureAmount = holdPI.amount; // in cents — equals the deposit for this package

    const amountToCapture = Math.round((captureAmount || (maxCaptureAmount / 100)) * 100);

    if (amountToCapture > maxCaptureAmount) {
      return Response.json({ error: `Cannot capture more than $${(maxCaptureAmount / 100).toLocaleString()}` }, { status: 400 });
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

    // Fire review email + return notification for the original booking
    const origPiId = await findOriginalBookingPI(result);
    await writeReturnedToBookingPI(origPiId, {
      action: 'capture',
      capturedAmount: finalCapturedAmount,
      damageReason: externalAction ? null : damageReason,
    });
    fireReviewRequestForBooking(origPiId);
    fireReturnNotification(result, origPiId, {
      action: 'capture',
      capturedAmount: finalCapturedAmount,
      releasedAmount: result.amount / 100 - finalCapturedAmount,
      damageReason: externalAction ? null : damageReason,
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
