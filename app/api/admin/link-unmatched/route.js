// app/api/admin/link-unmatched/route.js
// Links an unmatched number's messages to a booking's conversation. This:
//   1. moves every unmatched message for that number into /conversations/{sessionId}
//   2. writes the phone-index so future texts from that (alternate) number auto-route
//      to this booking — self-healing the "renter texted from a different number" case
//   3. deletes the moved messages from /conversations/unmatched

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
  await fetch(`${FIREBASE_DB_URL}${path}.json?auth=${encodeURIComponent(fbSecret)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

async function fbDelete(path) {
  const fbSecret = process.env.FIREBASE_DATABASE_SECRET;
  if (!fbSecret) return;
  await fetch(`${FIREBASE_DB_URL}${path}.json?auth=${encodeURIComponent(fbSecret)}`, {
    method: 'DELETE',
  });
}

export async function POST(request) {
  try {
    const { password, phone, sessionId } = await request.json();
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!phone || !sessionId) {
      return Response.json({ error: 'Missing phone or sessionId' }, { status: 400 });
    }

    const normalized = normalizeToE164(phone) || phone;
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '';

    const raw = await fbGet('/conversations/unmatched');
    if (!raw || typeof raw !== 'object') {
      return Response.json({ error: 'No unmatched messages found' }, { status: 400 });
    }

    const toMove = Object.entries(raw).filter(
      ([, m]) => m && (m.phone === normalized || m.from === normalized || m.to === normalized)
    );
    if (toMove.length === 0) {
      return Response.json({ error: 'No messages found for this number' }, { status: 400 });
    }

    // 1. Move each message into the booking conversation (keyed by its SID = idempotent).
    for (const [sid, m] of toMove) {
      const direction = m.direction || 'inbound';
      const key = m.twilioSid || sid;
      await fbPut(`/conversations/${sessionId}/messages/${key}`, {
        direction,
        body: m.body || '',
        from: direction === 'outbound' ? twilioNumber : normalized,
        to: direction === 'outbound' ? normalized : twilioNumber,
        timestamp: m.timestamp || new Date().toISOString(),
        twilioSid: key,
        linkedFromUnmatched: true,
      });
    }

    // 2. Self-heal the phone-index so this alternate number auto-routes next time.
    const phoneKey = normalized.replace(/^\+/, '');
    await fbPut(`/phone-index/${phoneKey}/${sessionId}`, true);

    // 3. Refresh conversation meta.
    const existingMeta = await fbGet(`/conversations/${sessionId}/meta`);
    await fbPut(`/conversations/${sessionId}/meta`, {
      ...(existingMeta && typeof existingMeta === 'object' ? existingMeta : {}),
      lastActivity: new Date().toISOString(),
      altPhone: normalized,
    });

    // 4. Remove the moved messages from unmatched.
    for (const [sid] of toMove) {
      await fbDelete(`/conversations/unmatched/${sid}`);
    }

    return Response.json({ success: true, moved: toMove.length });
  } catch (err) {
    console.error('[link-unmatched] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
