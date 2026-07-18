// app/api/admin/update-booking/route.js
// Version: 2026-06-18 — Use lib/reset-booking for reset_to_booked
// Last edited: June 18 2026
//
// Change: reset_to_booked now delegates to buildResetMetadata / diffResetMetadata
// from lib/reset-booking.js. Behavior is identical — refactor only.
//
// Builds on: 2026-06-16 (Add reset_to_booked action)

import Stripe from 'stripe';
import { sendReviewRequest } from '../../../../lib/review-email';
import { getDepositAmount } from '../../../../lib/deposit';
import { buildResetMetadata, diffResetMetadata } from '../../../../lib/reset-booking.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Fire-and-forget review email
function fireReviewRequestForBooking(piId) {
  if (!piId) return;
  sendReviewRequest(piId).catch((err) => {
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
      updates.cashDepositAmount = String(
        getDepositAmount(pi.metadata?.packageName || pi.metadata?.package)
      );
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
      const resetMeta = buildResetMetadata(before);
      Object.assign(updates, resetMeta);
    }

    await stripe.paymentIntents.update(paymentIntentId, { metadata: updates });

    // ── Fire review email if this action marks the rental as returned ────
    if (action === 'cash_deposit_returned' || action === 'mark_returned') {
      fireReviewRequestForBooking(paymentIntentId);
    }

    // ── For reset_to_booked: return before/after for auditability ────────
    if (action === 'reset_to_booked') {
      const changed = diffResetMetadata(before, updates);
      return Response.json({ success: true, action, changed });
    }

    return Response.json({ success: true, action, metadata: updates });
  } catch (err) {
    console.error('Update booking error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
