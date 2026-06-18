/**
 * Resolve the original booking PaymentIntent ID from a security-deposit hold PI.
 *
 * The booking PI is the PaymentIntent created by Stripe Checkout — it holds all
 * booking metadata (renterEmail, packageName, rentalStatus, etc.) and is what
 * list-bookings reads. The hold PI (created by charge-deposit) is separate.
 *
 * @param {object} hold   - Stripe PaymentIntent object (the hold PI)
 * @param {object} stripe - Stripe client instance (injected for testability)
 * @returns {Promise<string|null>}
 */
export async function findOriginalBookingPI(hold, stripe) {
  // Fast path: PI ID stored directly in hold metadata at charge-deposit time.
  // This survives transient Stripe API failures on session retrieve and avoids
  // an extra round-trip on every release/capture.
  const storedPiId = hold?.metadata?.originalPaymentIntentId;
  if (storedPiId) return storedPiId;

  // Fallback: retrieve the checkout session to extract payment_intent.
  // Handles holds created before originalPaymentIntentId was added (backward compat).
  const sessionId = hold?.metadata?.originalCheckoutSession;
  if (!sessionId) return null;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });
    // Normalise: payment_intent is either an expanded object or a bare string ID
    // when Stripe's expand degrades.
    const pi = session.payment_intent;
    return (typeof pi === 'string' ? pi : pi?.id) || null;
  } catch (err) {
    console.warn('[find-booking-pi] Could not retrieve checkout session:', err.message);
    return null;
  }
}
