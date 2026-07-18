import Stripe from 'stripe';
import { sendSMS } from '../../../../lib/sms';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';

// E.164 normalization — strip leading + for Firebase keys, keep + for Twilio/matching
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

// Firebase keys can't contain '.', so strip the leading '+' from E.164.
// "+18015551234" → "18015551234" (all digits, unambiguous)
function phoneToKey(e164) {
  return e164.replace(/^\+/, '');
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
    console.warn('[send-message] Firebase write failed:', err.message);
  }
}

export async function POST(request) {
  try {
    const { sessionId, password, body } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sessionId || !body?.trim()) {
      return Response.json({ error: 'Missing sessionId or message body' }, { status: 400 });
    }

    // Read PI metadata — single source of truth for phone and opt-in status
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });
    const pi = session.payment_intent;
    const meta = pi && typeof pi === 'object' ? pi.metadata : {};

    // Gate on smsOptIn === 'true' (exact stored value in Stripe metadata)
    if (meta.smsOptIn !== 'true') {
      return Response.json({ error: 'Renter has not opted in to SMS' }, { status: 400 });
    }

    const normalizedPhone = normalizeToE164(meta.renterPhone || '');
    if (!normalizedPhone) {
      return Response.json(
        { error: 'Invalid or missing phone number on booking' },
        { status: 400 }
      );
    }

    // All outbound routed through lib/sms.js — STOP enforcement lives there
    const smsResult = await sendSMS(normalizedPhone, body.trim());

    if (smsResult.skipped) {
      // Twilio blocked due to STOP or missing credentials
      return Response.json(
        {
          error:
            'Message not delivered — recipient may have opted out via STOP or credentials are missing.',
        },
        { status: 400 }
      );
    }
    if (!smsResult.success) {
      return Response.json(
        { error: 'SMS delivery failed', detail: smsResult.error },
        { status: 400 }
      );
    }

    const twilioSid = smsResult.sid || `admin-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Write message to Firebase — keyed by twilioSid for idempotency
    await fbPut(`/conversations/${sessionId}/messages/${twilioSid}`, {
      direction: 'outbound',
      body: body.trim(),
      from: process.env.TWILIO_PHONE_NUMBER || '',
      to: normalizedPhone,
      timestamp,
      twilioSid,
    });

    // Write/refresh conversation meta
    await fbPut(`/conversations/${sessionId}/meta`, {
      renterName: meta.renterName || '',
      renterPhone: normalizedPhone,
      lastActivity: timestamp,
      lastOutboundAt: timestamp,
    });

    // Write phone index — idempotent PUT, enables O(1) inbound resolution
    // Key: digits-only E.164 (no leading +) to avoid Firebase key restrictions
    await fbPut(`/phone-index/${phoneToKey(normalizedPhone)}/${sessionId}`, true);

    return Response.json({ success: true, sid: twilioSid });
  } catch (err) {
    console.error('[send-message] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
