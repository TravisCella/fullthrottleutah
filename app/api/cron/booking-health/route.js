// app/api/cron/booking-health/route.js
// Booking-funnel monitor. Two modes (driven by GitHub Actions since Vercel Hobby
// caps us at 2 native crons):
//   • daily  (default)      → SMS the owners ONLY IF zero paid bookings in the
//                             last N hours (default 72). Silent when healthy.
//   • weekly (?weekly=1)    → SMS a funnel snapshot: paid vs started + conversion
//                             over the last 7 days.
// Auth: Authorization: Bearer CRON_SECRET (same as win-back).
//
// "Booking" sessions are Checkout Sessions carrying booking metadata
// (metadata.packageName) — this excludes manual deposit-hold sessions.

import Stripe from 'stripe';
import { sendSMS } from '../../../../lib/sms';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Count booking checkout sessions created since `sinceSec`. Returns { started, paid }.
async function countBookingSessions(sinceSec) {
  let started = 0;
  let paid = 0;
  let scanned = 0;
  let page = await stripe.checkout.sessions.list({ created: { gte: sinceSec }, limit: 100 });
  while (true) {
    for (const s of page.data) {
      scanned++;
      // Booking sessions carry packageName in session metadata; deposit-hold
      // sessions carry metadata.type === 'manual_deposit_hold' — skip those.
      const isBooking = !!s.metadata?.packageName && s.metadata?.type !== 'manual_deposit_hold';
      if (!isBooking) continue;
      started++;
      if (s.payment_status === 'paid') paid++;
    }
    if (!page.has_more || scanned >= 500) break;
    page = await stripe.checkout.sessions.list({
      created: { gte: sinceSec },
      limit: 100,
      starting_after: page.data[page.data.length - 1].id,
    });
  }
  return { started, paid };
}

async function alertOwners(message) {
  const phones = (process.env.OWNER_PHONE_NUMBER || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const phone of phones) {
    try {
      await sendSMS(phone, message);
    } catch (err) {
      console.warn('[booking-health] alert failed for', phone, ':', err.message);
    }
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1000);

  try {
    // ── Weekly funnel snapshot ────────────────────────────────────────────────
    if (url.searchParams.get('weekly') === '1') {
      const since = now - 7 * 24 * 60 * 60;
      const { started, paid } = await countBookingSessions(since);
      const conv = started > 0 ? Math.round((paid / started) * 100) : 0;
      const msg =
        `FTU weekly funnel (7 days): ${paid} paid booking${paid === 1 ? '' : 's'} · ` +
        `${started} checkout${started === 1 ? '' : 's'} started · ${conv}% conversion.`;
      await alertOwners(msg);
      return Response.json({ mode: 'weekly', started, paid, conversionPct: conv });
    }

    // ── Daily low-volume alert ────────────────────────────────────────────────
    const hours = Math.min(168, Math.max(24, parseInt(url.searchParams.get('hours'), 10) || 72));
    const since = now - hours * 60 * 60;
    const { paid } = await countBookingSessions(since);

    if (paid === 0) {
      await alertOwners(
        `⚠️ FTU: 0 paid bookings in the last ${hours}h. The booking system is up — likely a traffic/demand dip. ` +
          `Do a quick test booking at fullthrottleutah.com if you want to be sure.`
      );
    }
    return Response.json({ mode: 'daily', hours, paid, alerted: paid === 0 });
  } catch (err) {
    console.error('[booking-health] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
