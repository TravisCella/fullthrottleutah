import { findOriginalBookingPI } from '../../lib/find-booking-pi';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SESSION_ID = 'cs_test_session_789';
const BOOKING_PI_ID = 'pi_test_booking_456';

function makeStripe(sessionRetrieveFn) {
  return {
    checkout: {
      sessions: {
        retrieve: sessionRetrieveFn,
      },
    },
  };
}

const workingSessionStripe = makeStripe(
  jest.fn().mockResolvedValue({ payment_intent: { id: BOOKING_PI_ID } })
);

const failingSessionStripe = makeStripe(
  jest.fn().mockRejectedValue(new Error('Stripe transient error — connection reset'))
);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('findOriginalBookingPI', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── Fast-path tests (originalPaymentIntentId stored in hold metadata) ──────
  //
  // These two tests FAIL before the fix:
  //   Current code skips the stored-ID check entirely, falls through to
  //   stripe.checkout.sessions.retrieve, and returns null when it throws.
  //
  describe('NEW holds — originalPaymentIntentId stored in hold metadata', () => {
    const holdWithStoredId = {
      metadata: {
        originalCheckoutSession: SESSION_ID,
        originalPaymentIntentId: BOOKING_PI_ID,
      },
    };

    test('returns stored PI ID without making a Stripe API call', async () => {
      const stripe = makeStripe(jest.fn()); // should never be called
      const result = await findOriginalBookingPI(holdWithStoredId, stripe);

      expect(result).toBe(BOOKING_PI_ID);
      expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });

    test('returns stored PI ID even when session retrieve fails (transient error)', async () => {
      // This is the root cause scenario: stripe.checkout.sessions.retrieve throws
      // (rate limit, network blip, transient 5xx). Without the fast-path, the function
      // returns null and writeReturnedToBookingPI silently skips — booking stays
      // "OUT · CARD HOLD" permanently.
      const result = await findOriginalBookingPI(holdWithStoredId, failingSessionStripe);

      expect(result).toBe(BOOKING_PI_ID); // FAILS before fix — returns null
    });
  });

  // ── Fallback tests (old holds without stored ID — backward compat) ─────────
  //
  // These tests should pass before AND after the fix.
  //
  describe('OLD holds — no originalPaymentIntentId, fall back to session retrieve', () => {
    const holdWithoutStoredId = {
      metadata: { originalCheckoutSession: SESSION_ID },
    };

    test('falls back to session retrieve and returns PI ID', async () => {
      const result = await findOriginalBookingPI(holdWithoutStoredId, workingSessionStripe);

      expect(result).toBe(BOOKING_PI_ID);
      expect(workingSessionStripe.checkout.sessions.retrieve).toHaveBeenCalledWith(SESSION_ID, {
        expand: ['payment_intent'],
      });
    });

    test('returns null when session retrieve fails (no stored ID to fall back on)', async () => {
      // For old holds this is still a failure mode, but at least it logs clearly.
      const result = await findOriginalBookingPI(holdWithoutStoredId, failingSessionStripe);

      expect(result).toBeNull();
    });

    test('handles bare string payment_intent (Stripe expand degradation)', async () => {
      const stripe = makeStripe(
        jest.fn().mockResolvedValue({ payment_intent: BOOKING_PI_ID }) // bare string
      );
      const result = await findOriginalBookingPI(holdWithoutStoredId, stripe);

      expect(result).toBe(BOOKING_PI_ID);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('returns null for a null hold', async () => {
      const stripe = makeStripe(jest.fn());
      expect(await findOriginalBookingPI(null, stripe)).toBeNull();
      expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });

    test('returns null for a hold with empty metadata', async () => {
      const stripe = makeStripe(jest.fn());
      expect(await findOriginalBookingPI({ metadata: {} }, stripe)).toBeNull();
      expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });
  });
});
