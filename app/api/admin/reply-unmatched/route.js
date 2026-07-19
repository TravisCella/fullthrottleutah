// app/api/admin/reply-unmatched/route.js
// Lets the admin reply to an inbound text that wasn't matched to a booking.
// Compliance: we only ever reply to a number that texted US first (a solicited,
// conversational reply) — never a cold send. STOP is still enforced in lib/sms.js.

import { sendSMS } from '../../../../lib/sms';

const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';

function normalizeToE164(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return digits.length >= 10 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function fbGet(path) {
  const fbSecret = process.env.FIREBASE_DATABASE_SECRET;
  if (!fbSecret) return null;
  try {
    const res = await fetch(`${FIREBASE_DB_URL}${path}.json?auth=${encodeURIComponent(fbSecret)}`);
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
    console.warn('[reply-unmatched] Firebase write failed:', err.message);
  }
}

export async function POST(request) {
  try {
    const { password, to, body } = await request.json();
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!to || !body?.trim()) {
      return Response.json({ error: 'Missing recipient or message body' }, { status: 400 });
    }

    const normalized = normalizeToE164(to);
    if (!normalized) {
      return Response.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    // Compliance guard: only reply to a number that has texted us first.
    const raw = await fbGet('/conversations/unmatched');
    const textedUsFirst =
      raw &&
      typeof raw === 'object' &&
      Object.values(raw).some(
        (m) =>
          m &&
          typeof m === 'object' &&
          (m.direction || 'inbound') === 'inbound' &&
          (m.phone === normalized || m.from === normalized)
      );
    if (!textedUsFirst) {
      return Response.json(
        { error: 'Can only reply to a number that has texted us first.' },
        { status: 400 }
      );
    }

    const smsResult = await sendSMS(normalized, body.trim());
    if (smsResult.skipped) {
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

    const sid = smsResult.sid || `admin-unmatched-${Date.now()}`;
    await fbPut(`/conversations/unmatched/${sid}`, {
      phone: normalized,
      to: normalized,
      direction: 'outbound',
      body: body.trim(),
      timestamp: new Date().toISOString(),
      twilioSid: sid,
    });

    return Response.json({ success: true, sid });
  } catch (err) {
    console.error('[reply-unmatched] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
