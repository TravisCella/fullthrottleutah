import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function POST(request) {
  try {
    const { password } = await request.json();
    
    // Auth check
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all successful checkout sessions from the last 90 days
    const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
    
    const sessions = await stripe.checkout.sessions.list({
      created: { gte: ninetyDaysAgo },
      limit: 100,
      expand: ['data.payment_intent', 'data.customer'],
    });

    // Filter to only paid sessions and format for the admin UI
    const bookings = sessions.data
      .filter(s => s.payment_status === 'paid')
      .map(s => {
        const pi = s.payment_intent || {};
        const meta = pi.metadata || {};
        const customer = s.customer || {};
        
        return {
          sessionId: s.id,
          paymentIntentId: pi.id || null,
          customerId: typeof customer === 'string' ? customer : customer.id,
          
          renterName: meta.renterName || customer.name || 'Unknown',
          renterEmail: meta.renterEmail || customer.email || '',
          renterPhone: meta.renterPhone || '',
          
          packageName: meta.packageName || '',
          location: meta.location || '',
          startDate: meta.startDate || '',
          endDate: meta.endDate || '',
          days: parseInt(meta.days || '1', 10),
          experience: meta.experience || '',
          
          totalPaid: s.amount_total / 100,
          rentalStatus: meta.rentalStatus || 'booked',
          securityDepositStatus: meta.securityDepositStatus || 'pending',
          securityDepositMethod: meta.securityDepositMethod || '',
          securityDepositHoldId: meta.securityDepositHoldId || null,
          
          whiteGlove: meta.whiteGlove === 'true',
          isLakePowell: meta.isLakePowell === 'true',
          waiverSigned: meta.waiverSigned === 'true',
          waiverDate: meta.waiverDate || '',
          
          createdAt: new Date(s.created * 1000).toISOString(),
          pickupTimestamp: meta.pickupTimestamp || null,
          returnTimestamp: meta.returnTimestamp || null,
        };
      });

    // Sort by start date (upcoming first)
    bookings.sort((a, b) => {
      const aDate = new Date(a.startDate || a.createdAt);
      const bDate = new Date(b.startDate || b.createdAt);
      return aDate - bDate;
    });

    return Response.json({ bookings });
  } catch (err) {
    console.error('List bookings error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
