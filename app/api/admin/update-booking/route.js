// app/api/admin/update-booking/route.js
// Version: 2026-06-02 — Auto-fire review request email after return
// Last edited: June 2 2026
//
// Change from prior version:
//   After successfully processing `mark_returned` or `cash_deposit_returned` action,
//   fire the review request email via lib/review-email.js. Fire-and-forget — never
//   blocks the booking update. Idempotent — review-email.js will skip if already sent
//   (e.g., if refund-deposit already fired one for this rental).

import Stripe from 'stripe';
import { sendReviewRequest } from '../../../../lib/review-email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    const validActions = ['cash_deposit_received', 'cash_deposit_returned', 'mark_returned'];
    if (!validActions.includes(action)) {
      return Response.json({ error: 'Invalid action' }, { status: 400 });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
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
    }

    await stripe.paymentIntents.update(paymentIntentId, { metadata: updates });

    // ── Fire review email if this action marks the rental as returned ────
    // (Skips cash_deposit_received which is a pickup, not a return)
    if (action === 'cash_deposit_returned' || action === 'mark_returned') {
      fireReviewRequestForBooking(paymentIntentId);
    }

    return Response.json({ success: true, action, metadata: updates });
  } catch (err) {
    console.error('Update booking error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
