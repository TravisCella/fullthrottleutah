// app/api/admin/list-bookings/route.js
// Version: 2026-06-17 — admin list: exclude refunded/canceled, dedupe, flag missing-Sheet
// Last edited: June 17 2026
//
// Problem fixed:
//   Stripe's Checkout Session payment_status is set to 'paid' at completion and
//   NEVER updated on refund. A fully-refunded session therefore permanently passed
//   the old `payment_status === 'paid'` filter and rendered as a ghost UPCOMING
//   booking (e.g. Shellie Boyle appearing twice despite one refunded PI).
//
// Changes:
//   1. EXPAND latest_charge — added 'data.payment_intent.latest_charge' to the
//      expand array. Refund state is read from pi.latest_charge.refunded (the
//      current Stripe API field). Do NOT use pi.charges?.data[0] — deprecated,
//      can be undefined depending on account API version (silent no-op).
//
//   2. FILTER out fully-refunded and canceled sessions — a session survives only
//      if payment_status==='paid' AND pi.status!=='canceled' AND its latest charge
//      is not fully refunded. Partial refunds (price adjustments on real trips)
//      are kept visible. If latest_charge is absent or unexpanded (bare string),
//      refund state is unknown — keep visible rather than silently drop a real
//      booking, and surface via flag #4.
//
//   3. DEDUPE surviving sessions by (renterEmail + startDate + packageName) as a
//      backstop against un-refunded double-submits. Within each group, prefer the
//      session that has a Sheet row; if multiple have Sheet rows (genuinely distinct
//      bookings), keep all; if none have Sheet rows, keep the oldest (first).
//
//   4. FLAG missing-Sheet sessions — sessions with no Sheet row fall back silently
//      to Stripe metadata in the old code, masking webhook-write failures. They
//      are still shown (a missing booking > a ghost), but inSheet:false is now
//      surfaced in the API response so the UI can badge them visibly.
//
// Data-source rationale: Stripe sessions remain the driving list, NOT Sheet rows.
//   The webhook has a history of failing to write Sheet rows (May 30 incident:
//   13/17 deliveries failed). A Sheet-driven list would silently hide any real
//   paid booking whose Sheet write failed — a missing booking is worse than a
//   visible ghost. Keep Stripe as source; use Sheet only to enrich each row.

import Stripe from 'stripe';
import { google } from 'googleapis';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Module-level response cache. Per-instance (best-effort on serverless), 60s TTL.
// Busted by post-mutation refreshes that send bust:true in the POST body.
let listCache = null; // { data: [...bookings], expiresAt: number }
const CACHE_TTL_MS = 60_000;

async function getAllBookingsFromSheet() {
  try {
    let credentials;
    if (process.env.GOOGLE_CREDENTIALS_BASE64) {
      const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
      credentials = JSON.parse(decoded);
    } else {
      credentials = {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };
    }

    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: 'Sheet1!A:N',
    });

    const rows = res.data.values || [];
    const bookingsMap = {};

    if (rows.length > 1) {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const bookingId = row[0];
        if (!bookingId) continue;

        bookingsMap[bookingId] = {
          booking_id: bookingId,
          date_booked: row[1] || '',
          package: row[2] || '',
          location: row[3] || '',
          start_date: row[4] || '',
          end_date: row[5] || '',
          days: row[6] || '',
          total_price: row[7] || '',
          deposit_paid: row[8] || '',
          renter_name: row[9] || '',
          renter_email: row[10] || '',
          renter_phone: row[11] || '',
          experience: row[12] || '',
          status: row[13] || 'CONFIRMED',
        };
      }
    }

    return bookingsMap;
  } catch (err) {
    console.error('Sheet read error (non-fatal):', err.message);
    return {};
  }
}

export async function POST(request) {
  try {
    const { password, bust } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Return cached result for rapid reloads. Skip cache when bust:true (post-mutation).
    if (!bust && listCache && Date.now() < listCache.expiresAt) {
      return Response.json({ bookings: listCache.data });
    }

    const oneYearAgo = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
    const MAX_SESSIONS = 1000;

    // First page + Sheet in parallel, then paginate through remaining pages
    const [firstPage, sheetBookings] = await Promise.all([
      stripe.checkout.sessions.list({
        created: { gte: oneYearAgo },
        limit: 100,
        expand: [
          'data.payment_intent',
          'data.payment_intent.latest_charge', // required for refund detection
          'data.customer',
        ],
      }),
      getAllBookingsFromSheet(),
    ]);

    const allSessions = [...firstPage.data];
    let page = firstPage;
    while (page.has_more && allSessions.length < MAX_SESSIONS) {
      page = await stripe.checkout.sessions.list({
        created: { gte: oneYearAgo },
        limit: 100,
        starting_after: page.data[page.data.length - 1].id,
        expand: [
          'data.payment_intent',
          'data.payment_intent.latest_charge',
          'data.customer',
        ],
      });
      allSessions.push(...page.data);
    }
    if (allSessions.length >= MAX_SESSIONS) {
      console.warn(`[list-bookings] Hit ${MAX_SESSIONS}-session ceiling — some sessions may be omitted.`);
    }

    // ── STEP 1: Filter ─────────────────────────────────────────────────────
    // Keep a session only if it represents a live, uncharged-back booking.
    const filtered = allSessions.filter(s => {
      if (s.payment_status !== 'paid') return false;

      const pi = s.payment_intent;
      const piObj = (pi && typeof pi === 'object') ? pi : null;

      // Exclude canceled payment intents
      if (piObj?.status === 'canceled') return false;

      // Exclude fully refunded charges. Read from latest_charge (current Stripe API).
      // If latest_charge is absent or unexpanded (bare string ID — Stripe expand
      // degradation), we can't determine refund state. Keep visible rather than
      // silently drop a real booking; the inSheet flag will surface the anomaly.
      const latestCharge = piObj?.latest_charge;
      if (latestCharge && typeof latestCharge === 'object') {
        if (latestCharge.refunded === true) return false;
        // latestCharge.amount_refunded > 0 but refunded !== true → partial refund
        // → keep visible (price adjustment on a real trip, not a cancellation)
      }

      return true;
    });

    // ── STEP 2: Map to booking objects ─────────────────────────────────────
    const mapped = filtered.map(s => {
      const pi = s.payment_intent;
      const piObj = (pi && typeof pi === 'object') ? pi : null;
      const meta = piObj?.metadata || {};
      const customer = s.customer || {};
      const sheetData = sheetBookings[s.id] || {};

      const renterName  = sheetData.renter_name  || meta.renterName  || (typeof customer === 'object' ? customer.name  : '') || '';
      const renterEmail = sheetData.renter_email  || meta.renterEmail || (typeof customer === 'object' ? customer.email : '') || '';
      const renterPhone = sheetData.renter_phone  || meta.renterPhone || '';
      const packageName = sheetData.package       || meta.packageName || '';
      const location    = sheetData.location      || meta.location    || '';
      const startDate   = sheetData.start_date    || meta.startDate   || '';
      const endDate     = sheetData.end_date      || meta.endDate     || startDate;
      const days        = sheetData.days          || meta.days        || '1';
      const experience  = sheetData.experience    || meta.experience  || '';
      const totalPrice  = sheetData.total_price   || (s.amount_total / 100).toString();

      const ownerEmail    = process.env.OWNER_EMAIL || '';
      const isTestBooking = !!(ownerEmail && renterEmail.toLowerCase() === ownerEmail.toLowerCase());
      const inSheet       = !!sheetData.booking_id;

      // Partial-refund flag: charge exists, has been partially refunded, not fully.
      // Kept visible (real trip) but useful context for the operator.
      const latestCharge = piObj?.latest_charge;
      const isPartiallyRefunded = !!(
        latestCharge &&
        typeof latestCharge === 'object' &&
        latestCharge.amount_refunded > 0 &&
        latestCharge.refunded !== true
      );

      return {
        sessionId:   s.id,
        paymentIntentId: piObj?.id || (typeof pi === 'string' ? pi : null),
        customerId:  typeof customer === 'string' ? customer : customer.id,

        renterName:  renterName || 'Unknown Customer',
        renterEmail,
        renterPhone,

        packageName,
        location,
        startDate,
        endDate,
        days: parseInt(days, 10) || 1,
        experience,

        totalPaid:   s.amount_total / 100,
        totalPrice:  parseFloat(totalPrice) || (s.amount_total / 100),
        rentalStatus:           meta.rentalStatus           || 'booked',
        securityDepositStatus:  meta.securityDepositStatus  || 'pending',
        securityDepositMethod:  meta.securityDepositMethod  || '',
        securityDepositHoldId:  meta.securityDepositHoldId  || null,

        whiteGlove:  meta.whiteGlove === 'true',
        isLakePowell: location?.toLowerCase().includes('powell') || meta.isLakePowell === 'true',
        waiverSigned: meta.waiverSigned === 'true' || sheetData.status === 'CONFIRMED',
        waiverDate:   meta.waiverDate || '',

        smsOptIn: meta.smsOptIn === 'true',

        isTestBooking,
        inSheet,
        isPartiallyRefunded,

        createdAt:        new Date(s.created * 1000).toISOString(),
        pickupTimestamp:  meta.pickupTimestamp  || null,
        returnTimestamp:  meta.returnTimestamp  || null,

        // Customer-selected pickup/return times from checkout (distinct from the
        // *Timestamp fields above, which are set at actual check-out/return).
        // camelCase first, snake_case fallback for older bookings (CLAUDE.md #5);
        // same 8 AM/8 PM defaults used in the webhook/SMS/email for pre-feature rows.
        pickupTimeDisplay: meta.pickupTimeDisplay || meta.pickup_time_display || '8:00 AM',
        returnTimeDisplay: meta.returnTimeDisplay || meta.return_time_display || '8:00 PM',
      };
    });

    // ── STEP 3: Dedupe ─────────────────────────────────────────────────────
    // Group sessions by (renterEmail + startDate + packageName). This collapses
    // un-refunded double-submits (a customer who paid twice and hasn't been
    // refunded yet). Within each group:
    //   • If any session has a Sheet row, keep all Sheet-backed sessions (they
    //     are distinct real bookings) and suppress any ghost sessions without
    //     Sheet rows.
    //   • If no session has a Sheet row, keep only the oldest (Stripe returns
    //     newest-first, so oldest = last in the list).
    // Sessions with no email fall back to sessionId as their key (treated as
    // unique — don't accidentally collapse unrelated anonymous bookings).
    const groups = new Map();
    for (const b of mapped) {
      const key = b.renterEmail
        ? [b.renterEmail.toLowerCase(), b.startDate || '', (b.packageName || '').toLowerCase()].join('|')
        : b.sessionId;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }

    const deduped = [];
    for (const group of groups.values()) {
      if (group.length === 1) {
        deduped.push(group[0]);
        continue;
      }
      const withSheet = group.filter(b => b.inSheet);
      if (withSheet.length > 0) {
        // Keep all Sheet-backed sessions; suppress ghosts (no Sheet row)
        deduped.push(...withSheet);
      } else {
        // All ghosts — keep the oldest (last element; Stripe list is newest-first)
        deduped.push(group[group.length - 1]);
      }
    }

    // ── STEP 4: Sort ───────────────────────────────────────────────────────
    deduped.sort((a, b) => {
      if (a.rentalStatus === 'returned' && b.rentalStatus !== 'returned') return 1;
      if (b.rentalStatus === 'returned' && a.rentalStatus !== 'returned') return -1;

      const parseDate = (d) => {
        if (!d) return new Date(0);
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          const [y, m, day] = d.split('-').map(Number);
          return new Date(y, m - 1, day);
        }
        return new Date(d);
      };

      return parseDate(a.startDate) - parseDate(b.startDate);
    });

    listCache = { data: deduped, expiresAt: Date.now() + CACHE_TTL_MS };
    return Response.json({ bookings: deduped });
  } catch (err) {
    console.error('List bookings error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
