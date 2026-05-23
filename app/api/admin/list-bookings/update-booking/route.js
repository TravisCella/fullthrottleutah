import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const { paymentIntentId, action, password, notes } = await request.json();
    
    // Auth check
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

    // Get current metadata
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

    return Response.json({ success: true, action, metadata: updates });
  } catch (err) {
    console.error('Update booking error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
