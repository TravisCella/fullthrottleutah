// app/api/admin/get-unmatched/route.js
// Returns inbound texts that couldn't be matched to a booking (e.g. the renter
// texted from a different number than they registered with), grouped by sender
// number into readable threads for the admin "Unmatched" inbox.

const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';

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

export async function POST(request) {
  try {
    const { password } = await request.json();
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const raw = await fbGet('/conversations/unmatched');

    const byPhone = {};
    let total = 0;
    if (raw && typeof raw === 'object') {
      for (const [sid, m] of Object.entries(raw)) {
        if (!m || typeof m !== 'object') continue;
        const phone = m.phone || m.from || m.to || 'unknown';
        if (!byPhone[phone]) byPhone[phone] = [];
        byPhone[phone].push({
          sid,
          direction: m.direction || 'inbound',
          body: m.body || '',
          timestamp: m.timestamp || '',
          twilioSid: m.twilioSid || sid,
        });
        total++;
      }
    }

    const threads = Object.entries(byPhone)
      .map(([phone, messages]) => {
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return {
          phone,
          messages,
          lastActivity: messages[messages.length - 1]?.timestamp || '',
        };
      })
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

    return Response.json({ threads, total });
  } catch (err) {
    console.error('[get-unmatched] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
