// app/api/admin/reschedule-booking/route.js
// Moves a booking to a new date and notifies the renter. No new charge — it's
// the same paid rental on a different day. Updates:
//   1. Stripe PaymentIntent metadata (startDate/endDate/days + rescheduledAt) —
//      the source of truth the admin dashboard reads.
//   2. The Google Sheet row (cols E/F/G) so pickup/return reminders fire on the
//      correct new date (non-fatal — a NO-SHEET booking still reschedules).
//   3. Sends the renter a rebooking notification (email always; SMS if opted in).
// NOTE: the Google Calendar event is NOT auto-moved (its event ID was never
// stored) — the admin UI reminds the operator to drag it to the new date.

import Stripe from 'stripe';
import { updateBookingDates } from '../../../../lib/sheets';
import { sendRescheduleNotification } from '../../../../lib/reschedule-notification';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(aIso, bIso) {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  const a = new Date(ay, am - 1, ad);
  const b = new Date(by, bm - 1, bd);
  return Math.round((b - a) / 864e5) + 1;
}

export async function POST(request) {
  try {
    const { sessionId, password, newStartDate, newEndDate } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sessionId || !newStartDate) {
      return Response.json({ error: 'Missing sessionId or newStartDate' }, { status: 400 });
    }
    if (!ISO.test(newStartDate)) {
      return Response.json({ error: 'newStartDate must be YYYY-MM-DD' }, { status: 400 });
    }
    const start = newStartDate;
    const end = newEndDate && ISO.test(newEndDate) ? newEndDate : start;
    if (end < start) {
      return Response.json({ error: 'End date cannot be before start date' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });
    const pi = session.payment_intent;
    const piObj = pi && typeof pi === 'object' ? pi : null;
    const meta = piObj?.metadata || session.metadata || {};
    const piId = piObj?.id || (typeof pi === 'string' ? pi : null);
    if (!piId) {
      return Response.json({ error: 'No PaymentIntent found on this booking' }, { status: 400 });
    }

    const oldStart = meta.startDate || '';
    const days = daysBetween(start, end);

    // 1. Stripe metadata (source of truth) — preserve all other fields.
    await stripe.paymentIntents.update(piId, {
      metadata: {
        ...meta,
        startDate: start,
        endDate: end,
        days: String(days),
        rescheduledAt: new Date().toISOString(),
        rescheduledFrom: oldStart,
      },
    });

    // 2. Google Sheet (non-fatal).
    let sheetUpdated = false;
    try {
      const r = await updateBookingDates(sessionId, start, end, days);
      sheetUpdated = !!r.updated;
      if (!r.updated) {
        console.warn(`[reschedule] Sheet row not updated for ${sessionId}: ${r.reason}`);
      }
    } catch (e) {
      console.error('[reschedule] Sheet update threw:', e.message);
    }

    // 3. Notify the renter (email always; SMS if opted in). Internally guarded.
    await sendRescheduleNotification({
      renterName: meta.renterName || '',
      renterEmail: meta.renterEmail || session.customer_details?.email || '',
      renterPhone: meta.renterPhone || '',
      smsOptIn: meta.smsOptIn === 'true',
      packageName: meta.packageName || meta.package || '',
      location: meta.location || '',
      newStart: start,
      newEnd: end,
      pickupTimeDisplay: meta.pickupTimeDisplay || meta.pickup_time_display || '',
      bookingId: sessionId,
    });

    return Response.json({
      success: true,
      newStart: start,
      newEnd: end,
      days,
      rescheduledFrom: oldStart,
      sheetUpdated,
    });
  } catch (err) {
    console.error('[reschedule-booking] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
