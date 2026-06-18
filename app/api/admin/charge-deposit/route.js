// app/api/admin/charge-deposit/route.js
// Version: 2026-06-16 — Deposit package-name resolution hardening
// Last edited: June 16 2026
//
// NEW (this version):
//   Two-change hardening around packageName resolution (step 3):
//
//   1. SESSION-METADATA FALLBACK — packageName now reads from four sources in
//      priority order: expandedPI.metadata.packageName → expandedPI.metadata.package
//      → session.metadata.packageName → session.metadata.package. The session-level
//      fields are always populated by checkout (bookingMeta is written to both the
//      session and the PI), so they survive even when Stripe's expand degrades and
//      expandedPI is null. Mirrors the PI-first/session-fallback pattern documented
//      in CLAUDE.md pitfall #5 and implemented in the webhook.
//
//   2. FAIL LOUD ON EMPTY PACKAGE — if packageName is still falsy after all four
//      fallbacks, the route returns a 422 with an actionable admin message rather
//      than silently defaulting to the Spark deposit amount. A missing package at
//      this point means a Stripe-expand or data anomaly; silently holding $1,000
//      on a $22K GTX machine is the exact outcome we're preventing.
//
// Builds on: 2026-06-13 (step-4 silent-skip fix + orphaned-hold repair)
//
// PRIOR VERSION NOTE:
//   session.payment_intent can come back as a bare string ID (not the expanded
//   object) when Stripe's expand silently degrades. In that case:
//     originalPI?.id  →  undefined   (string has no .id property)
//   The `if (originalPI?.id)` guard at step 4 evaluated to false, silently
//   skipping the paymentIntents.update call. The hold was created and the
//   admin UI showed success, but rentalStatus was never written — booking
//   stayed "UPCOMING" forever.
//
//   Fix: normalise originalPIId immediately after session retrieval using
//   `typeof originalPI === 'string' ? originalPI : originalPI?.id`. Step 4
//   now throws loudly if originalPIId is missing so it can never pass unnoticed.
//
// SELF-HEAL (orphaned holds):
//   inspectExistingHold() now accepts customerId + sessionId and falls back to
//   a Stripe PI list search when securityDepositHoldId is absent from the
//   booking PI metadata. When it finds an orphaned requires_capture hold, it
//   repairs the original PI metadata (rentalStatus, securityDepositStatus,
//   securityDepositHoldId) before returning — admin console flips to
//   "Out · Card Hold" after one refresh, and no duplicate charge is created.

import Stripe from 'stripe';
import { getDepositAmount } from '../../../../lib/deposit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function selectBestCard(customerId, originalPI) {
  const allMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });
  if (allMethods.data.length === 0) return null;

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
      console.warn('[charge-deposit] Could not retrieve original payment method:', e.message);
    }
  }

  if (originalFingerprint) {
    const match = allMethods.data.find(pm => pm.card?.fingerprint === originalFingerprint);
    if (match) return match;
  }

  const sorted = [...allMethods.data].sort((a, b) => b.created - a.created);
  return sorted[0];
}

// Check whether this booking already has a hold in flight.
//
// Path A: read securityDepositHoldId from the original PI metadata.
// Path B (new): if no holdId in metadata — meaning step 4 previously failed —
//              search the customer's recent PIs for a deposit hold tagged with
//              this session. Returns { orphaned: true } so the caller can repair
//              the missing metadata before returning, preventing a double charge.
//
// Returns:
//   { state: 'active',      hold, orphaned }  — live uncaptured hold
//   { state: 'pending_3ds', hold }             — awaiting 3DS auth
//   { state: 'stale',       hold }             — PI canceled/done; create fresh
//   null                                        — no hold found
async function inspectExistingHold(originalPIId, customerId, sessionId) {
  // ── Path A: check recorded holdId in original PI metadata ──
  if (originalPIId) {
    try {
      const originalPI = await stripe.paymentIntents.retrieve(originalPIId);
      const holdId = originalPI.metadata?.securityDepositHoldId;
      if (holdId) {
        const hold = await stripe.paymentIntents.retrieve(holdId);
        if (hold.status === 'requires_capture') {
          return { state: 'active', hold, orphaned: false };
        }
        if (hold.status === 'requires_action') {
          return { state: 'pending_3ds', hold };
        }
        return { state: 'stale', hold };
      }
    } catch (e) {
      console.warn('[charge-deposit] inspectExistingHold (path A) failed:', e.message);
    }
  }

  // ── Path B: no holdId in metadata — search by customer + session tag ──
  // Catches the case where the hold was created but the PI metadata write failed.
  if (customerId && sessionId) {
    try {
      const piList = await stripe.paymentIntents.list({ customer: customerId, limit: 20 });
      const orphanedHold = piList.data.find(
        pi =>
          pi.status === 'requires_capture' &&
          pi.metadata?.type === 'security_deposit_hold' &&
          pi.metadata?.originalCheckoutSession === sessionId
      );
      if (orphanedHold) {
        console.log('[charge-deposit] Found orphaned hold via customer search:', orphanedHold.id, 'for session', sessionId);
        return { state: 'active', hold: orphanedHold, orphaned: true };
      }
    } catch (e) {
      console.warn('[charge-deposit] inspectExistingHold (path B) failed:', e.message);
    }
  }

  return null;
}

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
    const { sessionId, password, inspectionId } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    });
    const customerId = session.customer?.id || session.customer;
    if (!customerId) {
      return Response.json({ error: 'No customer found on this booking' }, { status: 400 });
    }

    // ROOT CAUSE FIX: normalise before any use.
    // session.payment_intent is either an expanded PI object (normal) or a bare
    // string ID (when Stripe expand degrades). The old code used originalPI?.id
    // which is undefined on a string, silently skipping step 4.
    const originalPI = session.payment_intent;
    const originalPIId =
      typeof originalPI === 'string' ? originalPI : (originalPI?.id ?? null);
    // Keep the expanded object around for metadata spread and card fingerprint.
    const expandedPI = typeof originalPI === 'object' ? originalPI : null;

    // ─── 1. IDEMPOTENCY CHECK (with orphaned-hold repair) ─────────────────
    const existing = await inspectExistingHold(originalPIId, customerId, sessionId);

    if (existing?.state === 'active') {
      const cardLast4 = await getCardLast4(existing.hold.payment_method);

      // SELF-HEAL: orphaned hold means the hold PI exists in Stripe but the
      // booking PI metadata was never updated (step 4 previously failed).
      // Write the missing metadata now so the admin console status corrects
      // itself — no new charge is created.
      if (existing.orphaned && originalPIId) {
        try {
          // Re-fetch current metadata so we spread the freshest state.
          const currentPI = await stripe.paymentIntents.retrieve(originalPIId);
          await stripe.paymentIntents.update(originalPIId, {
            metadata: {
              ...currentPI.metadata,
              securityDepositStatus: 'held',
              securityDepositHoldId: existing.hold.id,
              securityDepositMethod: 'card',
              securityDepositCard: cardLast4,
              rentalStatus: 'picked_up',
              // Preserve original pickupTimestamp if it somehow got written; default to now.
              pickupTimestamp: currentPI.metadata?.pickupTimestamp || new Date().toISOString(),
            },
          });
          console.log('[charge-deposit] Orphaned hold metadata repaired for session', sessionId);
        } catch (repairErr) {
          // Non-fatal — the hold is valid and will NOT be duplicated.
          // Log clearly so manual reconciliation is possible if needed.
          console.error(
            `[charge-deposit] REPAIR FAILED session=${sessionId} hold=${existing.hold.id}:`,
            repairErr.message
          );
        }
      }

      return Response.json({
        success: true,
        holdId: existing.hold.id,
        cardLast4,
        status: existing.hold.status,
        alreadyHeld: true,
        note: existing.orphaned
          ? 'Orphaned hold found and metadata repaired — no new charge made.'
          : 'Hold already exists for this booking — no new charge made.',
      });
    }

    if (existing?.state === 'pending_3ds') {
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

    // existing?.state === 'stale' OR null → create a fresh hold

    // ─── 2. SMART CARD SELECTION ───────────────────────────────────────────
    const card = await selectBestCard(customerId, expandedPI);
    if (!card) {
      return Response.json(
        { error: 'No saved payment method found for this customer. Switch to cash deposit.' },
        { status: 400 }
      );
    }

    // ─── 3. CREATE THE HOLD ────────────────────────────────────────────────
    // Resolve package name: PI metadata first (most authoritative), then session
    // metadata as fallback for the known Stripe expand-degradation case where
    // expandedPI is null. Both objects are populated with identical bookingMeta
    // by checkout/route.js (lines 194–198). See CLAUDE.md pitfall #5.
    const packageName = expandedPI?.metadata?.packageName
                     || expandedPI?.metadata?.package
                     || session.metadata?.packageName
                     || session.metadata?.package
                     || '';

    // Fail loud: every checkout-originated booking has a package written. An
    // empty value here means a Stripe-expand anomaly or corrupted metadata —
    // silently defaulting to the Spark deposit would under-hold on a GTX booking.
    if (!packageName) {
      return Response.json(
        {
          error:
            'Could not determine package for this booking — verify the booking and place the deposit hold manually.',
        },
        { status: 422 }
      );
    }

    const depositAmount = getDepositAmount(packageName);

    let depositHold;
    try {
      depositHold = await stripe.paymentIntents.create({
        amount: depositAmount * 100,
        currency: 'usd',
        customer: customerId,
        payment_method: card.id,
        off_session: true,
        confirm: true,
        capture_method: 'manual',
        description: `Security deposit hold for booking ${sessionId}`,
        metadata: {
          originalCheckoutSession: sessionId,
          originalPaymentIntentId: originalPIId,
          renterName: expandedPI?.metadata?.renterName || '',
          renterEmail: expandedPI?.metadata?.renterEmail || '',
          type: 'security_deposit_hold',
        },
      });
    } catch (err) {
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
              `Customer's bank requires 3D Secure authentication for the $${depositAmount.toLocaleString()} hold. For now: switch to cash deposit, or try a different card. (Full 3DS pickup flow can be built later — the PaymentIntent is preserved.)`,
            code: 'authentication_required',
            cardLast4: card.card?.last4 || '****',
            cardBrand: card.card?.brand,
          },
          { status: 400 }
        );
      }

      if (err.code === 'insufficient_funds' || err.decline_code === 'insufficient_funds') {
        return Response.json(
          {
            error: `Card ending in ${card.card?.last4 || '****'} has insufficient funds for the $${depositAmount.toLocaleString()} hold. Try a different card or switch to cash.`,
            code: 'insufficient_funds',
            cardLast4: card.card?.last4 || '****',
          },
          { status: 400 }
        );
      }

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

      throw err;
    }

    // ─── 4. UPDATE ORIGINAL BOOKING METADATA ──────────────────────────────
    // ROOT CAUSE FIX: originalPIId is normalised above — no silent skip possible.
    // Throw loudly if it's missing: a hold now exists in Stripe and the admin
    // must see an error rather than a false success with an orphaned hold.
    if (!originalPIId) {
      throw new Error(
        `[charge-deposit] No PaymentIntent ID on session ${sessionId}. ` +
        `Hold ${depositHold.id} was created — manually set rentalStatus=picked_up on the booking PI.`
      );
    }

    // Use the already-expanded metadata if available; otherwise fetch it so we
    // don't accidentally wipe booking fields when spreading.
    const currentMeta = expandedPI?.metadata
      ? expandedPI.metadata
      : (await stripe.paymentIntents.retrieve(originalPIId)).metadata || {};

    await stripe.paymentIntents.update(originalPIId, {
      metadata: {
        ...currentMeta,
        securityDepositStatus: 'held',
        securityDepositHoldId: depositHold.id,
        securityDepositMethod: 'card',
        securityDepositCard: card.card?.last4 || '****',
        rentalStatus: 'picked_up',
        pickupTimestamp: new Date().toISOString(),
        ...(inspectionId ? { checkoutInspectionId: inspectionId } : {}),
      },
    });

    return Response.json({
      success: true,
      holdId: depositHold.id,
      cardLast4: card.card?.last4 || '****',
      cardBrand: card.card?.brand,
      status: depositHold.status,
      depositAmount,
    });
  } catch (err) {
    console.error('[charge-deposit] Unexpected error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
