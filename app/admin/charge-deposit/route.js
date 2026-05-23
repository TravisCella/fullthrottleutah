import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const { sessionId, password } = await request.json();
    
    // Auth check
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    // Get the original checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    });

    const customerId = session.customer?.id || session.customer;
    if (!customerId) {
      return Response.json({ error: 'No customer found on this booking' }, { status: 400 });
    }

    // Get the customer's saved payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    if (paymentMethods.data.length === 0) {
      return Response.json({ error: 'No saved payment method found for this customer' }, { status: 400 });
    }

    const paymentMethodId = paymentMethods.data[0].id;

    // Create the $1,000 hold (manual capture = won't charge until you capture it)
    const depositHold = await stripe.paymentIntents.create({
      amount: 100000, // $1,000 in cents
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      capture_method: 'manual', // KEY: this makes it a hold, not a charge
      description: `Security deposit hold for booking ${sessionId}`,
      metadata: {
        originalCheckoutSession: sessionId,
        renterName: session.payment_intent?.metadata?.renterName || '',
        renterEmail: session.payment_intent?.metadata?.renterEmail || '',
        type: 'security_deposit_hold',
      },
    });

    // Update the original checkout's metadata to track the hold
    if (session.payment_intent?.id) {
      await stripe.paymentIntents.update(session.payment_intent.id, {
        metadata: {
          ...session.payment_intent.metadata,
          securityDepositStatus: 'held',
          securityDepositHoldId: depositHold.id,
          securityDepositMethod: 'card',
          rentalStatus: 'picked_up',
          pickupTimestamp: new Date().toISOString(),
        },
      });
    }

    return Response.json({
      success: true,
      holdId: depositHold.id,
      cardLast4: paymentMethods.data[0].card?.last4 || '****',
      status: depositHold.status,
    });
  } catch (err) {
    console.error('Charge deposit error:', err);
    
    // Handle authentication required errors (3D Secure)
    if (err.code === 'authentication_required') {
      return Response.json({
        error: 'Card requires authentication. Customer must use a different payment method or pay cash.',
        code: err.code,
      }, { status: 400 });
    }
    
    return Response.json({ error: err.message }, { status: 500 });
  }
}
