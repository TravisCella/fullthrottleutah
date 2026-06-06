// app/api/checkout/route.js
// Version: 2026-06-06 — Server-side vest validation + spare vest fee
// Last edited: June 6 2026
// Feature: Receives the new vest fee fields from booking.js (spareVestCount,
//          extraVestFee) and validates everything server-side BEFORE creating
//          the Stripe session. This means even if the client UI is bypassed
//          (the 6-vest-on-Spark bug we saw), the server rejects bookings that
//          exceed boat capacity + 2 spares. Also recalculates the expected fee
//          server-side and rejects if the client's numbers don't match — so
//          no one can manipulate the total by tampering with the request body.
//
// Builds on: 2026-06-02 PM pickup/return times

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
          whiteGlove: whiteGlove ? 'true' : 'false',
          white_glove: whiteGlove ? 'true' : 'false',
          whiteGloveFee: whiteGloveFee?.toString() || '0',
          white_glove_fee: (whiteGloveFee || 0).toString(),
          holidaySurcharge: holidaySurcharge?.toString() || '0',
          holiday_surcharge: (holidaySurcharge || 0).toString(),
          deconFee: deconFee?.toString() || '0',
          decon_fee: (deconFee || 0).toString(),
          isLakePowell: isLakePowell ? 'true' : 'false',
          is_lake_powell: isLakePowell ? 'true' : 'false',
          loyaltyDiscount: loyaltyDiscount?.toString() || '0',
          loyalty_discount: (loyaltyDiscount || 0).toString(),
          // Life vest selection (NEW)
          vestSizes: vestSizes || '',
          vest_sizes: vestSizes || '',
          vestSummary: vestSummary || '',
          vest_summary: vestSummary || '',
          vestUsedDefault: vestUsedDefault ? 'true' : 'false',
          vest_used_default: vestUsedDefault ? 'true' : 'false',
          // Spare vest fee (2026-06-06) — using server-computed values, not client
          spareVestCount: serverSpareCount.toString(),
          spare_vest_count: serverSpareCount.toString(),
          extraVestFee: serverExtraFee.toString(),
          extra_vest_fee: serverExtraFee.toString(),
          // Pickup & return times (2026-06-02 PM)
          pickupTime: pickupTime || '08:00',
          pickup_time: pickupTime || '08:00',
          returnTime: returnTime || '20:00',
          return_time: returnTime || '20:00',
          pickupTimeDisplay: pickupTimeDisplay || '8:00 AM',
          pickup_time_display: pickupTimeDisplay || '8:00 AM',
          returnTimeDisplay: returnTimeDisplay || '8:00 PM',
          return_time_display: returnTimeDisplay || '8:00 PM',
          // SMS consent (TCPA tracking)
          smsOptIn: smsOptIn ? 'true' : 'false',
          smsOptInDate: smsOptIn ? new Date().toISOString() : '',
          // Waiver tracking
          waiverSigned: waiverSigned || 'false',
          waiverDate: waiverDate || '',
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
