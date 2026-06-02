// app/api/admin/charge-deposit/route.js
// Version: 2026-06-01 — Idempotency + smart card selection + 3DS handling + specific errors
// Last edited: June 1 2026
//
// Major improvements vs prior version:
//   1. IDEMPOTENCY — checks for an existing active hold before creating a new one.
//      Prevents the double-charge nightmare where a slow connection or accidental
//      double-click could place TWO $1,000 holds on the customer's card.
//
//   2. SMART CARD SELECTION — uses the card fingerprint from the customer's original
//      booking payment to pick the SAME card for the hold, instead of just grabbing
//      data[0]. If that card is no longer on file, falls back to the most recently
//      attached card. Avoids hold landing on a different card than the customer used.
//
//   3. 3DS / SCA HANDLING — when the bank requires authentication, Stripe still creates
//      the PaymentIntent (in `requires_action` state). Previously we threw it away with
//      a generic error. Now we preserve the PI ID + client_secret in the response so a
//      future admin UI can handle the SCA flow (send auth link to customer, etc).
//      For now Travis can fall back to cash, but the data is captured for later.
//
//   4. SPECIFIC ERROR HANDLING — separate user-friendly messages for the common Stripe
//      failure modes: card_declined, insufficient_funds, authentication_required,
//      card_declined_authentication_required. Each suggests the right next step.
//
//   5. STALE METADATA RECOVERY — if a booking shows "held" in metadata but the actual
//      hold PaymentIntent is canceled/succeeded/expired, we ignore the stale data and
//      create a fresh hold. Prevents the system from being stuck because of bad state.

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

// Find the most appropriate card to charge the hold against.
// Strategy:
//   1. Identify the card used in the original booking (by fingerprint)
//   2. If that card is still on file, use it
//   3. Otherwise use the most recently attached card
async function selectBestCard(customerId, originalPI) {
  // List ALL saved cards for this customer
  const allMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });
  if (allMethods.data.length === 0) return null;

  // Try to find the fingerprint of the card used for the original booking payment
  let originalFingerprint = null;
  if (originalPI?.payment_method) {
    try {
      const pmId =
        typeof originalPI.payment_method === 'string'
          ? originalPI.payment_method
          : originalPI.payment_method.id;
      const originalPM = await stripe.paymentMethods.retrieve(pmId);
      originalFingerprint = originalPM?.card?.fingerprint || null;
    } catch (e) {
      // Original card may have been removed — that's fine, fall through to "most recent"
      console.warn('[charge-deposit] Could not retrieve original payment method:', e.message);
    }
  }

  // Prefer the same card as the booking
  if (originalFingerprint) {
    const match = allMethods.data.find(pm => pm.card?.fingerprint === originalFingerprint);
    if (match) return match;
  }

  // Fall back to the most recently attached card
  const sorted = [...allMethods.data].sort((a, b) => b.created - a.created);
  return sorted[0];
}

// Check whether this booking already has a hold in flight.
// Returns one of:
//   { state: 'active',       hold }   — there's a live uncaptured hold (don't create another!)
//   { state: 'pending_3ds',  hold }   — there's a hold awaiting customer authentication
//   { state: 'stale' }                — metadata says "held" but the actual PI is canceled/done
//   null                              — no hold tracked
async function inspectExistingHold(originalPIId) {
  if (!originalPIId) return null;
  try {
    const originalPI = await stripe.paymentIntents.retrieve(originalPIId);
    const holdId = originalPI.metadata?.securityDepositHoldId;
    if (!holdId) return null;

    const hold = await stripe.paymentIntents.retrieve(holdId);

    if (hold.status === 'requires_capture') {
      return { state: 'active', hold };
    }
    if (hold.status === 'requires_action') {
      return { state: 'pending_3ds', hold };
    }
    // canceled / succeeded / processing / requires_payment_method — metadata is stale
    return { state: 'stale', hold };
  } catch (e) {
    console.warn('[charge-deposit] inspectExistingHold failed:', e.message);
    return null;
  }
}

// Get the last 4 from a payment method (handles both string IDs and expanded objects)
async function getCardLast4(paymentMethod) {
  if (!paymentMethod) return '****';
  if (typeof paymentMethod === 'object' && paymentMethod.card?.last4) {
    return paymentMethod.card.last4;
  }
  try {
    const pmId = typeof paymentMethod === 'string' ? paymentMethod : paymentMethod.id;
    const pm = await stripe.paymentMethods.retrieve(pmId);
    return pm?.card?.last4 || '****';
  } catch {
    return '****';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const { sessionId, password } = await request.json();

    // Auth
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    // Get the original booking
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    });
    const customerId = session.customer?.id || session.customer;
    if (!customerId) {
      return Response.json({ error: 'No customer found on this booking' }, { status: 400 });
    }
    const originalPI = session.payment_intent;

    // ─── 1. IDEMPOTENCY CHECK ──────────────────────────────────────────
    const existing = await inspectExistingHold(originalPI?.id);

    if (existing?.state === 'active') {
      // There's already a live $1,000 hold — return it instead of creating another.
      const cardLast4 = await getCardLast4(existing.hold.payment_method);
      return Response.json({
        success: true,
        holdId: existing.hold.id,
        cardLast4,
        status: existing.hold.status,
        alreadyHeld: true,
        note: 'Hold already exists for this booking — no new charge made.',
      });
    }

    if (existing?.state === 'pending_3ds') {
      // Awaiting customer authentication — surface this so admin can resend the auth link
      // (once we build that flow). For now, tell Travis what's happening.
      return Response.json(
        {
          success: false,
          requiresAction: true,
          holdId: existing.hold.id,
          clientSecret: existing.hold.client_secret,
          error:
            "A hold is pending — customer's bank required 3D Secure authentication. Customer needs to complete authentication via their bank's app, or switch to cash deposit.",
          code: 'pending_3ds',
        },
        { status: 400 }
      );
    }

    // existing?.state === 'stale' OR null → continue and create a fresh hold

    // ─── 2. SMART CARD SELECTION ───────────────────────────────────────
    const card = await selectBestCard(customerId, originalPI);
    if (!card) {
      return Response.json(
        { error: 'No saved payment method found for this customer. Switch to cash deposit.' },
        { status: 400 }
      );
    }

    // ─── 3. CREATE THE HOLD ────────────────────────────────────────────
    let depositHold;
    try {
      depositHold = await stripe.paymentIntents.create({
        amount: 100000, // $1,000 in cents
        currency: 'usd',
        customer: customerId,
        payment_method: card.id,
        off_session: true,
        confirm: true,
        capture_method: 'manual', // KEY: creates a hold, not a charge
        description: `Security deposit hold for booking ${sessionId}`,
        metadata: {
          originalCheckoutSession: sessionId,
          renterName: originalPI?.metadata?.renterName || '',
          renterEmail: originalPI?.metadata?.renterEmail || '',
          type: 'security_deposit_hold',
        },
      });
    } catch (err) {
      // ── 3a. 3DS / AUTHENTICATION REQUIRED ──
      // Stripe creates the PaymentIntent in `requires_action` state when 3DS is needed.
      // Preserve its ID + client_secret so a future SCA flow can handle authentication.
      if (
        err.code === 'authentication_required' ||
        err.code === 'card_declined_authentication_required'
      ) {
        const failedPI = err.raw?.payment_intent;
        return Response.json(
          {
            success: false,
            requiresAction: true,
            holdId: failedPI?.id,
            clientSecret: failedPI?.client_secret,
            error:
              "Customer's bank requires 3D Secure authentication for the $1,000 hold. For now: switch to cash deposit, or try a different card. (Full 3DS pickup flow can be built later — the PaymentIntent is preserved.)",
            code: 'authentication_required',
            cardLast4: card.card?.last4 || '****',
            cardBrand: card.card?.brand,
          },
          { status: 400 }
        );
      }

      // ── 3b. INSUFFICIENT FUNDS ──
      if (err.code === 'insufficient_funds' || err.decline_code === 'insufficient_funds') {
        return Response.json(
          {
            error: `Card ending in ${card.card?.last4 || '****'} has insufficient funds for the $1,000 hold. Try a different card or switch to cash.`,
            code: 'insufficient_funds',
            cardLast4: card.card?.last4 || '****',
          },
          { status: 400 }
        );
      }

      // ── 3c. EXPIRED CARD ──
      if (err.decline_code === 'expired_card' || err.code === 'expired_card') {
        return Response.json(
          {
            error: `Card ending in ${card.card?.last4 || '****'} is expired. Customer needs to update their card or switch to cash.`,
            code: 'expired_card',
            cardLast4: card.card?.last4 || '****',
          },
          { status: 400 }
        );
      }

      // ── 3d. GENERIC CARD DECLINE ──
      if (err.code === 'card_declined') {
        return Response.json(
          {
            error: `Card ending in ${card.card?.last4 || '****'} was declined${
              err.decline_code ? ` (${err.decline_code})` : ''
            }. Try a different card or switch to cash.`,
            code: 'card_declined',
            declineCode: err.decline_code,
            cardLast4: card.card?.last4 || '****',
          },
          { status: 400 }
        );
      }

      // ── 3e. UNKNOWN — bubble up ──
      throw err;
    }

    // ─── 4. UPDATE ORIGINAL BOOKING METADATA ───────────────────────────
    if (originalPI?.id) {
      await stripe.paymentIntents.update(originalPI.id, {
        metadata: {
          ...originalPI.metadata,
          securityDepositStatus: 'held',
          securityDepositHoldId: depositHold.id,
          securityDepositMethod: 'card',
          securityDepositCard: card.card?.last4 || '****',
          rentalStatus: 'picked_up',
          pickupTimestamp: new Date().toISOString(),
        },
      });
    }

    return Response.json({
      success: true,
      holdId: depositHold.id,
      cardLast4: card.card?.last4 || '****',
      cardBrand: card.card?.brand,
      status: depositHold.status,
    });
  } catch (err) {
    console.error('[charge-deposit] Unexpected error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
