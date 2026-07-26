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
const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';
// Throttle the daily low-volume alert so a sustained drought pings at most once
// every 3 days instead of every day. State resets when bookings resume, so the
// next drought alerts immediately.
const ALERT_THROTTLE_MS = 3 * 24 * 60 * 60 * 1000;

async function fbGet(path) {
  const secret = process.env.FIREBASE_DATABASE_SECRET;
  if (!secret) return null;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}${path}.json?auth=${encodeURIComponent(secret)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fbPut(path, value) {
  const secret = process.env.FIREBASE_DATABASE_SECRET;
  if (!secret) return;
  try {
    await fetch(`${FIREBASE_DB_URL}${path}.json?auth=${encodeURIComponent(secret)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  } catch (err) {
    console.warn('[booking-health] Firebase write failed:', err.message);
  }
}

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

    const state = (await fbGet('/monitoring/lowVolume')) || {};
    const lastAlertMs = state.lastAlertAt ? new Date(state.lastAlertAt).getTime() : 0;
    let alerted = false;
    let throttled = false;

    if (paid === 0) {
      if (Date.now() - lastAlertMs >= ALERT_THROTTLE_MS) {
        await alertOwners(
          `⚠️ FTU: 0 paid bookings in the last ${hours}h. The booking system is up — likely a traffic/demand dip. ` +
            `Do a quick test booking at fullthrottleutah.com if you want to be sure. (Next alert in ~3 days if still quiet.)`
        );
        await fbPut('/monitoring/lowVolume', { lastAlertAt: new Date().toISOString(), hours });
        alerted = true;
      } else {
        throttled = true; // still quiet, but within the 3-day window — stay silent
      }
    } else if (state.lastAlertAt) {
      // Bookings resumed — clear state so the next drought alerts immediately.
      await fbPut('/monitoring/lowVolume', { lastAlertAt: '' });
    }

    return Response.json({ mode: 'daily', hours, paid, alerted, throttled });
  } catch (err) {
    console.error('[booking-health] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
