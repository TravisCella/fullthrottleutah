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
// 2026-06-20: Server-authoritative pricing (price-tamper fix)
//      computeTotal() from lib/pricing.js now computes the Stripe charge.
//      The client-sent totalPrice is NEVER used for the charge amount.
//      Repeat-customer status is determined server-side via isRepeatCustomer();
//      on any error, no discount applies (fail closed — client flag not used).
//      spareVestCount / extraVestFee come from priceBreakdown, not client.
//      All pricing fields in bookingMeta are server-authoritative.
//      35 metadata keys — still under the 50-key cap.
//
// Builds on: 2026-06-06 Phase 2 agreement metadata

import Stripe from 'stripe';
import { computeTotal, getPackage, getLocation, MAX_EXTRA_VESTS } from '../../../lib/pricing';
import { isRepeatCustomer, getPremiumDates } from '../../../lib/sheets';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';

// Renters must be at least 25 as of the rental start date. This is the
// AUTHORITATIVE age gate — the browser gate in booking.js is secondary.
// Returns the renter's age in whole years as of refStr ('YYYY-MM-DD'), or null
// if the DOB is missing/unparseable (treated as ineligible → rejected).
const MIN_RENTER_AGE = 25;
function computeAgeAsOf(dobStr, refStr) {
  if (!dobStr || typeof dobStr !== 'string') return null;
  const [by, bm, bd] = dobStr.split('-').map(Number);
  if (!by || !bm || !bd) return null;
  const born = new Date(by, bm - 1, bd);
  if (isNaN(born.getTime())) return null;
  const [ry, rm, rd] = String(refStr || '')
    .split('-')
    .map(Number);
  const ref = ry && rm && rd ? new Date(ry, rm - 1, rd) : new Date();
  let age = ref.getFullYear() - born.getFullYear();
  const mo = ref.getMonth() - born.getMonth();
  if (mo < 0 || (mo === 0 && ref.getDate() < born.getDate())) age--;
  return age;
}

export async function POST(request) {
  try {
    const data = await request.json();

    const {
      packageName,
      packageTagline,
      totalPrice, // client-sent; used only for mismatch logging
      days,
      startDate,
      endDate,
      locationId, // preferred id string ("pineview") — absent in old bundles
      location, // display name — kept for webhook/sheet/metadata + getLocation fallback
      renterName,
      renterEmail,
      renterPhone,
      renterDob, // "YYYY-MM-DD" from the DOB field
      experience,
      smsOptIn,
      whiteGlove,
      isLakePowell,
      vestSizes, // JSON string of {size_key: count}
      vestSummary, // human-readable string
      vestUsedDefault, // true if customer skipped and we defaulted
      pickupTime, // 24-hr internal "HH:MM"
      returnTime, // 24-hr internal "HH:MM"
      pickupTimeDisplay, // 12-hr display string
      returnTimeDisplay, // 12-hr display string
      waiverSigned,
      waiverDate,
      // ── Rental Agreement (Phase 2) ──
      agreementSigned,
      agreementVersion,
      agreementSignedAt,
      agreementChecksJson,
    } = data;

    // ─── Age hard-reject: renters must be 25+ as of the rental start date ──
    // Authoritative server enforcement of the 25+ policy. A missing/invalid DOB
    // or an age under 25 is rejected before any Stripe object is created.
    const renterAge = computeAgeAsOf(renterDob, startDate);
    if (renterAge == null || renterAge < MIN_RENTER_AGE) {
      console.warn(
        `[checkout] Age gate rejected booking: renter=${renterEmail}, dob=${renterDob || 'missing'}, computedAge=${renterAge}`
      );
      return Response.json(
        { error: 'Renters must be at least 25 years old. We are unable to complete this booking.' },
        { status: 400 }
      );
    }

    // ─── Disabled-lake guard ──────────────────────────────────────────────
    // A lake marked `disabled` in LOCATIONS is not bookable (e.g. Pineview
    // when drawn down/unboatable). Reject server-side so a stale client bundle
    // or a saved deep link can't slip a booking through after we pull it.
    const bookingLocation = getLocation(locationId || location);
    if (bookingLocation?.disabled) {
      return Response.json(
        {
          error: `${bookingLocation.name} is not currently available for booking. Please choose another lake.`,
        },
        { status: 400 }
      );
    }

    // ─── Vest hard-reject (unchanged logic) ──────────────────────────────
    const pkg = getPackage(packageName);
    if (!pkg) {
      return Response.json({ error: `Unknown package: ${packageName}` }, { status: 400 });
    }
    const maxTotalVests = pkg.maxRiders + MAX_EXTRA_VESTS;

    let parsedVests = {};
    try {
      parsedVests = typeof vestSizes === 'string' ? JSON.parse(vestSizes) : vestSizes || {};
    } catch (e) {
      return Response.json({ error: 'Invalid vestSizes payload' }, { status: 400 });
    }
    const serverTotalVests = Object.values(parsedVests).reduce((s, v) => s + (Number(v) || 0), 0);

    if (serverTotalVests > maxTotalVests) {
      console.error(
        `[checkout] Rejecting booking: ${serverTotalVests} vests for ${packageName} (max ${maxTotalVests}). renter=${renterEmail}`
      );
      return Response.json(
        {
          error: `Vest selection exceeds boat capacity. ${packageName} allows up to ${pkg.maxRiders} riders + ${MAX_EXTRA_VESTS} spare vests (${maxTotalVests} total). You selected ${serverTotalVests}.`,
        },
        { status: 400 }
      );
    }
    // ──────────────────────────────────────────────────────────────────────

    // ─── Server-side repeat-customer check ───────────────────────────────
    // isRepeatCustomer() already returns false on its own Sheets errors.
    // When repeat status can't be confirmed, no loyalty discount applies.
    // The client-sent repeatCustomer flag is intentionally NOT used for pricing.
    let repeatCustomer = false;
    try {
      repeatCustomer = await isRepeatCustomer(renterEmail, renterPhone);
    } catch (rcErr) {
      console.warn(
        `[checkout] isRepeatCustomer threw for ${renterEmail} — no discount applied:`,
        rcErr.message
      );
      repeatCustomer = false;
    }
    // ──────────────────────────────────────────────────────────────────────

    // ─── Authoritative server price ───────────────────────────────────────
    // The Stripe charge is always Math.round(priceBreakdown.total * 100).
    // The client-sent totalPrice is never used for the charge — only logged.
    // An unresolvable package or location (tampered or stale client) fails
    // closed with a 400 rather than an unhandled 500.

    // Fetch Premiums tab overrides (non-fatal — if Sheets call fails, no promo applied).
    let premiums = [];
    try {
      premiums = await getPremiumDates(packageName);
    } catch (premiumsErr) {
      console.warn('[checkout] getPremiumDates failed — no promo applied:', premiumsErr.message);
    }

    let priceBreakdown;
    try {
      priceBreakdown = computeTotal({
        packageName,
        startDate,
        endDate,
        locationId: locationId || location,
        whiteGlove: !!whiteGlove,
        vestSizes: parsedVests,
        repeatCustomer,
        premiums,
      });
    } catch (pricingErr) {
      console.error(`[checkout] computeTotal failed for ${renterEmail}:`, pricingErr.message);
      return Response.json({ error: 'Invalid booking details' }, { status: 400 });
    }

    const fullAmount = Math.round(priceBreakdown.total * 100);

    if (Math.abs((totalPrice || 0) - priceBreakdown.total) > 1) {
      console.warn(
        `[checkout] Price mismatch for ${renterEmail}: client sent $${totalPrice}, server computed $${priceBreakdown.total}. Charging server value.`
      );
    }
    // ──────────────────────────────────────────────────────────────────────

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

    // Shared metadata attached to both the session and the payment intent.
    // Session-level metadata is readable even for abandoned/expired sessions
    // where no payment intent was created. Both objects: 35 keys (under the 50-key cap).
    // 2026-06-06 Phase 3 fix: removed snake_case duplicates to stay under cap.
    // 2026-06-20: all pricing fields use server-computed values from priceBreakdown.
    // Webhook reads camelCase first with snake_case fallback for older bookings.
    const bookingMeta = {
      // Renter info
      renterName,
      renterEmail,
      renterPhone,
      renterDob: renterDob || '',
      experience: experience || '',
      // Booking details
      packageName,
      locationId: locationId || '',
      location,
      startDate,
      endDate,
      days: days?.toString() || '1',
      // Pricing — server-authoritative values from priceBreakdown
      whiteGlove: whiteGlove ? 'true' : 'false',
      whiteGloveFee: priceBreakdown.whiteGloveFee.toString(),
      holidaySurcharge: priceBreakdown.holidaySurcharge.toString(),
      deconFee: priceBreakdown.deconFee.toString(),
      isLakePowell: isLakePowell ? 'true' : 'false',
      loyaltyDiscount: priceBreakdown.loyaltyDiscount.toString(),
      // Life vest selection
      vestSizes: vestSizes || '',
      vestSummary: vestSummary || '',
      vestUsedDefault: vestUsedDefault ? 'true' : 'false',
      // Spare vest fee — server-computed from priceBreakdown
      spareVestCount: priceBreakdown.spareVestCount.toString(),
      extraVestFee: priceBreakdown.extraVestFee.toString(),
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
      // Promo — only set when a Premiums-tab discount/surcharge was applied
      promoDiscount:
        priceBreakdown.premiumAdjustment !== 0 ? priceBreakdown.premiumAdjustment.toString() : '',
      promoReason: priceBreakdown.promoReason || '',
      // Status flags for admin dashboard
      securityDepositStatus: 'pending',
      rentalStatus: 'booked',
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer: customer.id,
      metadata: bookingMeta,
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: bookingMeta,
      },
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${packageName}${whiteGlove && priceBreakdown.whiteGloveFee > 0 ? ` (White Glove $${priceBreakdown.whiteGloveFee})` : whiteGlove ? ' (White Glove)' : ''}`,
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

    // Write a pending-checkout record to Firebase so the win-back cron can find
    // customers who reached Stripe but didn't complete payment.
    // Non-fatal: a Firebase failure here must NEVER block or alter the checkout
    // response — the customer is already on their way to pay.
    try {
      const fbSecret = process.env.FIREBASE_DATABASE_SECRET;
      if (fbSecret) {
        const now = Date.now();
        const pendingRecord = {
          sessionId: session.id,
          checkoutUrl: session.url,
          renterName,
          renterEmail,
          renterPhone: renterPhone || '',
          smsOptIn: smsOptIn ? 'true' : 'false',
          packageName,
          location,
          startDate,
          endDate: endDate || startDate,
          days: days?.toString() || '1',
          totalPrice: priceBreakdown.total.toString(),
          createdAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000, // Stripe session default: 24 h
          status: 'pending',
          nudged: false,
        };
        const fbRes = await fetch(
          `${FIREBASE_DB_URL}/pending-checkouts/${session.id}.json?auth=${encodeURIComponent(fbSecret)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingRecord),
          }
        );
        if (!fbRes.ok) {
          const errText = await fbRes.text();
          console.error(
            '[checkout] Firebase pending-checkout write failed:',
            fbRes.status,
            errText
          );
        }
      } else {
        console.warn(
          '[checkout] FIREBASE_DATABASE_SECRET not set — skipping pending-checkout write'
        );
      }
    } catch (fbErr) {
      console.error('[checkout] Pending-checkout write threw:', fbErr.message);
    }

    // Write phone-index entry so inbound texts can be resolved O(1) to this session.
    // Non-fatal — must never block the checkout response.
    try {
      const fbSecret = process.env.FIREBASE_DATABASE_SECRET;
      if (fbSecret && renterPhone) {
        const rawDigits = renterPhone.replace(/\D/g, '');
        const phoneKey =
          rawDigits.length === 10
            ? `1${rawDigits}`
            : rawDigits.length === 11 && rawDigits.startsWith('1')
              ? rawDigits
              : null;
        if (phoneKey) {
          await fetch(
            `${FIREBASE_DB_URL}/phone-index/${phoneKey}/${session.id}.json?auth=${encodeURIComponent(fbSecret)}`,
            { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: 'true' }
          );
        }
      }
    } catch (piErr) {
      console.error('[checkout] Phone-index write threw:', piErr.message);
    }

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
