// app/api/checkout/route.js
// Version: 2026-06-06 Phase 3 — Dedupe metadata keys (under Stripe's 50-key cap)
// Last edited: June 9 2026
// Fix: A live booking failed with "Metadata can have up to 50 keys, but you've
//      set 52" from Stripe. Cause: each new feature (white-glove, vest sizes,
//      pickup times, spare fees, rental agreement) added BOTH camelCase and
//      snake_case versions of its fields "for webhook compatibility" — 18
//      duplicate pairs total, pushing us over the 50-key cap.
//      Fix: drop all snake_case duplicates. Webhook reads camelCase first
//      with snake_case as fallback, so existing bookings are unaffected.
//      Brings active key count from 52 → 34.
//
// Builds on: 2026-06-06 Phase 2 agreement metadata

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── Server-side source of truth for boat rider capacity (USCG-rated) ──
// Must stay in sync with PACKAGES[].maxRiders in app/booking.js. Kept here
// so the server can independently validate vest counts regardless of what
// the client sends.
const MAX_RIDERS_BY_PACKAGE = {
  'Spark Duo': 4,         // 2 riders × 2 Sparks
  'GTX Limited Duo': 6,   // 3 riders × 2 GTX 325s
};
const SPARE_VEST_FEE = 15;       // $ per spare vest beyond capacity
const MAX_SPARE_VESTS = 2;       // hard cap on spares

export async function POST(request) {
  try {
    const data = await request.json();

    const {
      packageName,
      packageTagline,
      totalPrice,
      days,
      startDate,
      endDate,
      location,
      renterName,
      renterEmail,
      renterPhone,
      experience,
      smsOptIn,
      whiteGlove,
      whiteGloveFee,
      holidaySurcharge,
      deconFee,
      isLakePowell,
      loyaltyDiscount,
      vestSizes,        // JSON string of {size_key: count}
      vestSummary,      // Human-readable string
      vestUsedDefault,  // true if customer skipped and we defaulted
      spareVestCount,   // # of vests beyond boat capacity (2026-06-06)
      extraVestFee,     // $ fee for spares (2026-06-06)
      pickupTime,        // 24-hr internal format "HH:MM" (e.g. "08:00")
      returnTime,        // 24-hr internal format "HH:MM" (e.g. "20:00")
      pickupTimeDisplay, // 12-hr display string (e.g. "8:00 AM")
      returnTimeDisplay, // 12-hr display string (e.g. "8:00 PM")
      waiverSigned,
      waiverDate,
      // ── Rental Agreement (Phase 2) ──
      agreementSigned,
      agreementVersion,
      agreementSignedAt,
      agreementChecksJson,
    } = data;

    // ─── 2026-06-06: Server-side vest validation ─────────────────────────
    // Independent check so client-side UI bugs (or tampered requests) can't
    // bypass boat capacity rules. This was added after a customer somehow
    // checked out with 6 vests on a Spark Duo (rated for 4 riders + 2 spares
    // max = 6 vests). The math here is the source of truth.
    const maxRiders = MAX_RIDERS_BY_PACKAGE[packageName];
    if (!maxRiders) {
      return Response.json(
        { error: `Unknown package: ${packageName}` },
        { status: 400 }
      );
    }
    const maxTotalVests = maxRiders + MAX_SPARE_VESTS;

    // Parse and count the vest selection
    let parsedVests = {};
    try {
      parsedVests = typeof vestSizes === 'string' ? JSON.parse(vestSizes) : (vestSizes || {});
    } catch (e) {
      return Response.json({ error: 'Invalid vestSizes payload' }, { status: 400 });
    }
    const serverTotalVests = Object.values(parsedVests).reduce(
      (s, v) => s + (Number(v) || 0), 0
    );

    // Hard cap check — reject anything beyond capacity + 2 spares
    if (serverTotalVests > maxTotalVests) {
      console.error(
        `[checkout] Rejecting booking: ${serverTotalVests} vests for ${packageName} (max ${maxTotalVests}). renter=${renterEmail}`
      );
      return Response.json(
        {
          error: `Vest selection exceeds boat capacity. ${packageName} allows up to ${maxRiders} riders + ${MAX_SPARE_VESTS} spare vests (${maxTotalVests} total). You selected ${serverTotalVests}.`,
        },
        { status: 400 }
      );
    }

    // Recompute the spare fee from scratch — the source of truth.
    // If client-sent extraVestFee disagrees, we use the server value (no error).
    const serverSpareCount = Math.max(0, serverTotalVests - maxRiders);
    const serverExtraFee = serverSpareCount * SPARE_VEST_FEE;
    if (Number(extraVestFee) !== serverExtraFee) {
      console.warn(
        `[checkout] Vest fee mismatch — client sent ${extraVestFee}, server computed ${serverExtraFee}. Using server value.`
      );
    }
    // ──────────────────────────────────────────────────────────────────────

    const fullAmount = Math.round(totalPrice * 100);

    let customer;
    const existingCustomers = await stripe.customers.list({ email: renterEmail, limit: 1 });
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: renterEmail,
        name: renterName,
        phone: renterPhone,
        metadata: {
          experience: experience || '',
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer: customer.id,
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          // Renter info
          renterName,
          renterEmail,
          renterPhone,
          experience: experience || '',
          // Booking details
          packageName,
          location,
          startDate,
          endDate,
          days: days?.toString() || '1',
          // Pricing detail flags
          // 2026-06-06 Phase 3 fix: removed snake_case duplicates to stay
          // under Stripe's 50-key metadata cap. Webhook reads camelCase first
          // with snake_case fallback, so existing bookings continue working.
          whiteGlove: whiteGlove ? 'true' : 'false',
          whiteGloveFee: whiteGloveFee?.toString() || '0',
          holidaySurcharge: holidaySurcharge?.toString() || '0',
          deconFee: deconFee?.toString() || '0',
          isLakePowell: isLakePowell ? 'true' : 'false',
          loyaltyDiscount: loyaltyDiscount?.toString() || '0',
          // Life vest selection
          vestSizes: vestSizes || '',
          vestSummary: vestSummary || '',
          vestUsedDefault: vestUsedDefault ? 'true' : 'false',
          // Spare vest fee — server-computed values, not client
          spareVestCount: serverSpareCount.toString(),
          extraVestFee: serverExtraFee.toString(),
          // Pickup & return times
          pickupTime: pickupTime || '08:00',
          returnTime: returnTime || '20:00',
          pickupTimeDisplay: pickupTimeDisplay || '8:00 AM',
          returnTimeDisplay: returnTimeDisplay || '8:00 PM',
          // SMS consent (TCPA tracking)
          smsOptIn: smsOptIn ? 'true' : 'false',
          smsOptInDate: smsOptIn ? new Date().toISOString() : '',
          // Waiver tracking
          waiverSigned: waiverSigned || 'false',
          waiverDate: waiverDate || '',
          // Rental Agreement tracking (Phase 2)
          agreementSigned: agreementSigned || 'false',
          agreementVersion: agreementVersion || '',
          agreementSignedAt: agreementSignedAt || '',
          // Note: agreementChecksJson can be 200+ chars; trim to Stripe's 500-char metadata limit
          agreementChecksJson: (agreementChecksJson || '').slice(0, 490),
          // Status flags for admin dashboard
          securityDepositStatus: 'pending',
          rentalStatus: 'booked',
        },
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${packageName}${whiteGlove && whiteGloveFee > 0 ? ` (White Glove $${whiteGloveFee})` : whiteGlove ? ' (White Glove)' : ''}`,
              description: `${packageTagline} · ${location} · ${days} day${days > 1 ? 's' : ''} (${startDate}${endDate !== startDate ? ` - ${endDate}` : ''})`,
            },
            unit_amount: fullAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${request.headers.get('origin') || 'https://www.fullthrottleutah.com'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin') || 'https://www.fullthrottleutah.com'}/`,
    });

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
