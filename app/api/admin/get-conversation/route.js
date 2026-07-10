const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';

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

export async function POST(request) {
  try {
    const { sessionId, password } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sessionId) {
      return Response.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    const [conversation, unmatched] = await Promise.all([
      fbGet(`/conversations/${sessionId}`),
      fbGet('/conversations/unmatched'),
    ]);

    const messages = conversation?.messages
      ? Object.values(conversation.messages).sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        )
      : [];

    const meta = conversation?.meta || null;
    const unmatchedCount = unmatched ? Object.keys(unmatched).length : 0;

    return Response.json({ messages, meta, unmatchedCount });
  } catch (err) {
    console.error('[get-conversation] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
