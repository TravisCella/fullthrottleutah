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
    if (ta === 2) return new Date(a.startDate) - new Date(b.startDate);
    if (ta === 4) return new Date(b.startDate) - new Date(a.startDate);
    return 0;
  })[0] || null;
}

async function resolveFromPhoneIndex(normalizedFrom) {
  const indexEntry = await fbGet(`/phone-index/${phoneToKey(normalizedFrom)}`);
  if (!indexEntry || typeof indexEntry !== 'object') return null;

  const sessionIds = Object.keys(indexEntry).filter(k => k && k !== 'null');
  if (sessionIds.length === 0) return null;
  if (sessionIds.length === 1) return { sessionId: sessionIds[0] };

  const candidates = [];
  for (const sid of sessionIds) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sid, { expand: ['payment_intent'] });
      const pi = session.payment_intent;
      const meta = (pi && typeof pi === 'object') ? pi.metadata : {};
      if (meta.rentalStatus === 'cancelled') continue;
      candidates.push({ sessionId: sid, rentalStatus: meta.rentalStatus || 'booked', startDate: meta.startDate || '' });
    } catch (err) {
      console.warn(`[twilio/incoming] session retrieve failed for ${sid}:`, err.message);
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return applyTieredPrecedence(candidates);
}

async function resolveFromStripe(normalizedFrom) {
  const since = Math.floor(Date.now() / 1000) - (180 * 24 * 60 * 60);
  const candidates = [];
  let scanned = 0;
  let page = await stripe.checkout.sessions.list({ created: { gte: since }, limit: 100, expand: ['data.payment_intent'] });

  while (true) {
    for (const session of page.data) {
      scanned++;
      if (session.payment_status !== 'paid') continue;
      const pi = session.payment_intent;
      const meta = (pi && typeof pi === 'object') ? pi.metadata : {};
      if (meta.rentalStatus === 'cancelled') continue;
      const storedPhone = normalizeToE164(meta.renterPhone || '');
      if (storedPhone === normalizedFrom) {
        candidates.push({ sessionId: session.id, rentalStatus: meta.rentalStatus || 'booked', startDate: meta.startDate || '' });
      }
    }
    if (!page.has_more || scanned >= 200) break;
    page = await stripe.checkout.sessions.list({ created: { gte: since }, limit: 100, starting_after: page.data[page.data.length - 1].id, expand: ['data.payment_intent'] });
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  return applyTieredPrecedence(candidates);
}

export async function POST(request) {
  // Read raw body — must happen before any framework body parsing
  let rawBody = '';
  let params = {};
  try {
    rawBody = await request.text();
    params = Object.fromEntries(new URLSearchParams(rawBody));
  } catch (err) {
    console.error('[twilio/incoming] Failed to parse body:', err.message);
    return new Response(TWIML_OK, { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }

  // Reconstruct the public-facing URL from forwarded headers.
  // request.url on Vercel can differ from the URL Twilio signed against,
  // causing signature validation to fail. x-forwarded-* headers reflect
  // the URL Twilio actually called.
  const proto    = request.headers.get('x-forwarded-proto') || 'https';
  const host     = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const pathname = new URL(request.url).pathname;
  const webhookUrl = host ? `${proto}://${host}${pathname}` : request.url;

  const authToken  = process.env.TWILIO_AUTH_TOKEN || '';
  const signature  = request.headers.get('x-twilio-signature') || '';

  console.log('[twilio/incoming] proto:', proto, '| host:', host, '| pathname:', pathname, '| webhookUrl:', webhookUrl);
  console.log('[twilio/incoming] hasSig:', !!signature, '| sigLen:', signature.length, '| hasToken:', !!authToken, '| tokenLen:', authToken.length, '| params:', Object.keys(params).join(','));

  if (!validateTwilioSignature(authToken, signature, webhookUrl, params)) {
    console.warn('[twilio/incoming] Signature validation failed — returning 403');
    return new Response('Forbidden', { status: 403 });
  }

  const from       = params.From       || '';
  const body       = params.Body       || '';
  const messageSid = params.MessageSid || `fallback-${Date.now()}`;
  const timestamp  = new Date().toISOString();

  const normalizedFrom = normalizeToE164(from);
  if (!normalizedFrom) {
    console.warn('[twilio/incoming] Unparseable From number:', from);
    return new Response(TWIML_OK, { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }

  // Phone-index lookup is O(1) and fast (~100ms). Stripe scan is intentionally
  // skipped here — it can take seconds and Vercel terminates the function after
  // the response is sent (fire-and-forget does not work in serverless). Messages
  // from phones not in the index go to unmatched; the admin badge will surface them.
  // Index is populated at checkout and whenever admin sends a message.
  const resolved = await resolveFromPhoneIndex(normalizedFrom);

  if (resolved) {
    await fbPut(`/conversations/${resolved.sessionId}/messages/${messageSid}`, {
      direction: 'inbound',
      body,
      from: normalizedFrom,
      to: process.env.TWILIO_PHONE_NUMBER || '',
      timestamp,
      twilioSid: messageSid,
    });

    const existingMeta = await fbGet(`/conversations/${resolved.sessionId}/meta`);
    await fbPut(`/conversations/${resolved.sessionId}/meta`, {
      ...(existingMeta && typeof existingMeta === 'object' ? existingMeta : {}),
      lastActivity: timestamp,
    });

    await fbPut(`/phone-index/${phoneToKey(normalizedFrom)}/${resolved.sessionId}`, true);
    console.log(`[twilio/incoming] Written to conversation ${resolved.sessionId} (${messageSid})`);
  } else {
    await fbPut(`/conversations/unmatched/${messageSid}`, {
      from: normalizedFrom, body, timestamp, twilioSid: messageSid,
    });
    console.warn('[twilio/incoming] No booking matched for:', normalizedFrom, '— written to unmatched');
  }

  return new Response(TWIML_OK, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}
