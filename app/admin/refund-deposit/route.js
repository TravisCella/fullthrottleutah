import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    let result;

    if (action === 'release') {
      // Cancel the hold entirely - customer is charged $0
      result = await stripe.paymentIntents.cancel(holdId);
    } else {
      // Capture (charge) a portion or all of the hold
      const amountToCapture = Math.round((captureAmount || 1000) * 100);
      
      if (amountToCapture > 100000) {
        return Response.json({ error: 'Cannot capture more than $1,000' }, { status: 400 });
      }
      
      if (amountToCapture < 100) {
        return Response.json({ error: 'Minimum capture is $1.00' }, { status: 400 });
      }

      result = await stripe.paymentIntents.capture(holdId, {
        amount_to_capture: amountToCapture,
      });

      // Update metadata
      await stripe.paymentIntents.update(holdId, {
        metadata: {
          ...result.metadata,
          damageReason: damageReason || 'Not specified',
          capturedAmount: (amountToCapture / 100).toString(),
          captureTimestamp: new Date().toISOString(),
        },
      });
    }

    return Response.json({
      success: true,
      action: action,
      holdId: result.id,
      status: result.status,
      amount: result.amount / 100,
      capturedAmount: action === 'capture' ? (result.amount_received / 100) : 0,
    });
  } catch (err) {
    console.error('Refund deposit error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
