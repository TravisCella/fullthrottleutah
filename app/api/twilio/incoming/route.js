import Stripe from 'stripe';
import { validateTwilioSignature } from '../../../../lib/twilio-signature';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';
const TWIML_OK = '<Response/>';

function normalizeToE164(phone) {
  if (!phone) return null;
  if (phone.startsWith('+')) {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 ? `+${digits}` : null;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function phoneToKey(e164) {
  return e164.replace(/^\+/, '');
}

async function fbGet(path) {
  const fbSecret = process.env.FIREBASE_DATABASE_SECRET;
  if (!fbSecret) return null;
  try {
    const res = await fetch(
      `${FIREBASE_DB_URL}${path}.json?auth=${encodeURIComponent(fbSecret)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fbPut(path, value) {
  const fbSecret = process.env.FIREBASE_DATABASE_SECRET;
  if (!fbSecret) return;
  try {
    await fetch(`${FIREBASE_DB_URL}${path}.json?auth=${encodeURIComponent(fbSecret)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  } catch (err) {
    console.warn('[twilio/incoming] Firebase write failed:', err.message);
  }
}

// Tiered precedence — explicit rule, not a pure start_date sort.
// Tier 1: currently picked_up (on the water right now)
// Tier 2: booked with future start_date (upcoming, soonest first within tier)
// Tier 3: booked with past start_date (edge case — overdue/no-show)
// Tier 4: returned (completed, most recent first within tier)
function applyTieredPrecedence(candidates) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  function tier(s) {
    if (s.rentalStatus === 'picked_up') return 1;
    const startMs = s.startDate ? new Date(s.startDate + 'T00:00:00').getTime() : 0;
    if (s.rentalStatus === 'booked' && startMs >= todayMs) return 2;
    if (s.rentalStatus === 'booked') return 3;
    if (s.rentalStatus === 'returned') return 4;
    return 5;
  }

  return [...candidates].sort((a, b) => {
    const ta = tier(a), tb = tier(b);
    if (ta !== tb) return ta - tb;
    // Tier 2: soonest upcoming first (ASC)
    if (ta === 2) return new Date(a.startDate) - new Date(b.startDate);
    // Tier 4: most recent completed first (DESC)
    if (ta === 4) return new Date(b.startDate) - new Date(a.startDate);
    return 0;
  })[0] || null;
}

// O(1) phone-index lookup. Single entry → return directly (no Stripe call).
// Multiple entries → retrieve each session for current rentalStatus, then apply precedence.
async function resolveFromPhoneIndex(normalizedFrom) {
  const indexEntry = await fbGet(`/phone-index/${phoneToKey(normalizedFrom)}`);
  if (!indexEntry || typeof indexEntry !== 'object') return null;

  const sessionIds = Object.keys(indexEntry).filter(k => k && k !== 'null');
  if (sessionIds.length === 0) return null;

  // Single booking — O(1), no Stripe call needed
  if (sessionIds.length === 1) {
    return { sessionId: sessionIds[0] };
  }

  // Multiple bookings — retrieve each for current rentalStatus to apply precedence
  const candidates = [];
  for (const sid of sessionIds) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sid, {
        expand: ['payment_intent'],
      });
      const pi = session.payment_intent;
      const meta = (pi && typeof pi === 'object') ? pi.metadata : {};
      if (meta.rentalStatus === 'cancelled') continue;
      candidates.push({
        sessionId: sid,
        rentalStatus: meta.rentalStatus || 'booked',
        startDate: meta.startDate || '',
      });
    } catch (err) {
      console.warn(`[twilio/incoming] session retrieve failed for ${sid}:`, err.message);
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return applyTieredPrecedence(candidates);
}

// Stripe session scan fallback — used when phone not in index (renter texts before admin)
// 180-day window, max 200 sessions (typically 1–2 Stripe pages for this business volume)
async function resolveFromStripe(normalizedFrom) {
  const since = Math.floor(Date.now() / 1000) - (180 * 24 * 60 * 60);
  const candidates = [];
  let scanned = 0;
  let page = await stripe.checkout.sessions.list({
    created: { gte: since },
    limit: 100,
    expand: ['data.payment_intent'],
  });

  while (true) {
    for (const session of page.data) {
      scanned++;
      if (session.payment_status !== 'paid') continue;
      const pi = session.payment_intent;
      const meta = (pi && typeof pi === 'object') ? pi.metadata : {};
      if (meta.rentalStatus === 'cancelled') continue;
      const storedPhone = normalizeToE164(meta.renterPhone || '');
      if (storedPhone === normalizedFrom) {
        candidates.push({
          sessionId: session.id,
          rentalStatus: meta.rentalStatus || 'booked',
          startDate: meta.startDate || '',
        });
      }
    }
    if (!page.has_more || scanned >= 200) break;
    page = await stripe.checkout.sessions.list({
      created: { gte: since },
      limit: 100,
      starting_after: page.data[page.data.length - 1].id,
      expand: ['data.payment_intent'],
    });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return applyTieredPrecedence(candidates);
}

export async function POST(request) {
  // 1. Read raw body — required for Twilio signature validation
  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // 2. Validate X-Twilio-Signature — ONLY non-2xx exit in this route
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const signature = request.headers.get('x-twilio-signature') || '';
  const url = request.url;

  if (!validateTwilioSignature(authToken, signature, url, params)) {
    console.warn('[twilio/incoming] Rejected — invalid Twilio signature');
    return new Response('Forbidden', { status: 403 });
  }

  // 3. Process — always return TwiML 200, never propagate throws
  try {
    const from        = params.From        || '';
    const body        = params.Body        || '';
    const messageSid  = params.MessageSid  || `fallback-${Date.now()}`;
    const timestamp   = new Date().toISOString();

    const normalizedFrom = normalizeToE164(from);
    if (!normalizedFrom) {
      console.warn('[twilio/incoming] Unparseable From number:', from);
      // fall through — return TwiML
    } else {
      // 4. Resolve booking: phone-index first (O(1)), Stripe scan as fallback
      let resolved = await resolveFromPhoneIndex(normalizedFrom);
      if (!resolved) {
        console.log('[twilio/incoming] Not in index, scanning Stripe:', normalizedFrom);
        resolved = await resolveFromStripe(normalizedFrom);
      }

      if (resolved) {
        // 5a. Write inbound message — keyed by MessageSid (idempotent against retries)
        await fbPut(
          `/conversations/${resolved.sessionId}/messages/${messageSid}`,
          {
            direction: 'inbound',
            body,
            from: normalizedFrom,
            to: process.env.TWILIO_PHONE_NUMBER || '',
            timestamp,
            twilioSid: messageSid,
          }
        );

        // Update lastActivity on conversation meta, preserving existing fields
        const existingMeta = await fbGet(`/conversations/${resolved.sessionId}/meta`);
        await fbPut(`/conversations/${resolved.sessionId}/meta`, {
          ...(existingMeta && typeof existingMeta === 'object' ? existingMeta : {}),
          lastActivity: timestamp,
        });

        // Refresh phone index (idempotent — keeps index warm if Stripe scan found this)
        await fbPut(`/phone-index/${phoneToKey(normalizedFrom)}/${resolved.sessionId}`, true);

        console.log(`[twilio/incoming] Written to conversation ${resolved.sessionId} (${messageSid})`);
      } else {
        // 5b. No booking found — write to unmatched bucket, keyed by MessageSid
        await fbPut(`/conversations/unmatched/${messageSid}`, {
          from: normalizedFrom,
          body,
          timestamp,
          twilioSid: messageSid,
        });
        console.warn('[twilio/incoming] No booking matched for:', normalizedFrom, '— written to unmatched');
      }
    }
  } catch (err) {
    // Log but never propagate — a 500 triggers Twilio retries which compound idempotency issues
    console.error('[twilio/incoming] Processing error (non-fatal, returning TwiML):', err.message);
  }

  // 4. Always return valid TwiML — no auto-reply, just acknowledge
  return new Response(TWIML_OK, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
