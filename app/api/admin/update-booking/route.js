// app/api/admin/update-booking/route.js
// Version: 2026-06-16 — Add reset_to_booked action
// Last edited: June 16 2026
//
// New action: reset_to_booked
//   Resets a booking's PaymentIntent metadata to a clean pre-pickup state.
//   Clears all deposit/pickup/return fields while leaving core booking data
//   (renter info, dates, package, location, pricing, waiver) untouched.
//   Returns before/after metadata snapshot for auditability.
//   Use case: mis-applied deposit (wrong customer), accidental state advance,
//   or any scenario where a booking needs to re-enter the pickup flow.
//
// Builds on: 2026-06-02 auto-fire review request email after return

import Stripe from 'stripe';
import { sendReviewRequest } from '../../../../lib/review-email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Fields that reset_to_booked clears. These are exclusively deposit/pickup/return
// lifecycle fields — none of the core booking fields (renter name, dates, package, etc.)
const RESET_FIELDS = [
  'rentalStatus',
  'securityDepositStatus',
  'securityDepositHoldId',
  'securityDepositMethod',
  'securityDepositCard',
  'pickupTimestamp',
  'returnTimestamp',
  'capturedAmount',
  'damageReason',
  'captureTimestamp',
  'returnNotes',
  'cashDepositAmount',
  'externalStripeAction',
  'externalStripeActionAt',
];

// Fire-and-forget review email
function fireReviewRequestForBooking(piId) {
  if (!piId) return;
  sendReviewRequest(piId).catch(err => {
    console.error('[update-booking] Review email fire-and-forget failed:', err.message);
  });
}

export async function POST(request) {
  try {
    const { paymentIntentId, action, password, notes } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!paymentIntentId || !action) {
      return Response.json({ error: 'Missing paymentIntentId or action' }, { status: 400 });
    }

    const validActions = [
      'cash_deposit_received',
      'cash_deposit_returned',
      'mark_returned',
      'reset_to_booked',
    ];
    if (!validActions.includes(action)) {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const before = { ...pi.metadata };
    const updates = { ...pi.metadata };

    if (action === 'cash_deposit_received') {
      updates.securityDepositStatus = 'cash_held';
      updates.securityDepositMethod = 'cash';
      updates.rentalStatus = 'picked_up';
      updates.pickupTimestamp = new Date().toISOString();
      updates.cashDepositAmount = '1000';
    } else if (action === 'cash_deposit_returned') {
      updates.securityDepositStatus = 'released';
      updates.rentalStatus = 'returned';
      updates.returnTimestamp = new Date().toISOString();
      if (notes) updates.returnNotes = notes;
    } else if (action === 'mark_returned') {
      updates.rentalStatus = 'returned';
      updates.returnTimestamp = new Date().toISOString();
      if (notes) updates.returnNotes = notes;
    } else if (action === 'reset_to_booked') {
      // Reset lifecycle fields to clean pre-pickup state.
      // Stripe treats '' as deleting the key from metadata.
      for (const field of RESET_FIELDS) {
        updates[field] = '';
      }
      // Set the two status fields to their canonical initial values.
      updates.rentalStatus = 'booked';
      updates.securityDepositStatus = 'pending';
    }

    await stripe.paymentIntents.update(paymentIntentId, { metadata: updates });

    // ── Fire review email if this action marks the rental as returned ────
    if (action === 'cash_deposit_returned' || action === 'mark_returned') {
      fireReviewRequestForBooking(paymentIntentId);
    }

    // ── For reset_to_booked: return before/after for auditability ────────
    if (action === 'reset_to_booked') {
      const changed = {};
      for (const field of RESET_FIELDS) {
        if (before[field] !== undefined && before[field] !== '') {
          changed[field] = { before: before[field], after: updates[field] };
        }
      }
      // Always show the two status fields regardless
      changed.rentalStatus        = { before: before.rentalStatus        || '(unset)', after: updates.rentalStatus };
      changed.securityDepositStatus = { before: before.securityDepositStatus || '(unset)', after: updates.securityDepositStatus };

      return Response.json({ success: true, action, changed });
    }

    return Response.json({ success: true, action, metadata: updates });
  } catch (err) {
    console.error('Update booking error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
