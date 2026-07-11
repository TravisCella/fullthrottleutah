// app/api/cron/unanswered-chat/route.js
// Fires every minute via Vercel Cron (requires Vercel Pro plan).
// Sends one SMS to all OWNER_PHONE_NUMBER phones when any customer message
// has gone unanswered for ≥ 90 s. Worst-case alert latency: 90 + 60 = 150 s.
//
// "Unanswered" = last message in conversation is inbound AND no outbound reply
// since then AND we haven't already alerted for that specific inbound SID.

import { sendSMS } from '../../../../lib/sms';

const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';
const STALE_MS = 90_000; // 90 seconds — guarantees alert within 150 s of message

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

async function fbPatch(path, value) {
  const secret = process.env.FIREBASE_DATABASE_SECRET;
  if (!secret) return;
  try {
    await fetch(`${FIREBASE_DB_URL}${path}.json?auth=${encodeURIComponent(secret)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  } catch (err) {
    console.warn('[unanswered-chat] Firebase patch failed:', err.message);
  }
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const alerts = [];

  // ── Matched conversations ─────────────────────────────────────────────────
  // Shallow fetch returns { sessionId: true, unmatched: true, ... } — O(1) then
  // parallel meta reads per session, no full message tree needed.
  const shallowKeys = await fbGet('/conversations?shallow=true');
  const sessionIds = shallowKeys
    ? Object.keys(shallowKeys).filter(k => k !== 'unmatched')
    : [];

  const metaResults = await Promise.all(
    sessionIds.map(async sid => ({ sid, meta: await fbGet(`/conversations/${sid}/meta`) }))
  );

  for (const { sid, meta } of metaResults) {
    if (!meta?.lastInboundAt) continue;

    const age = now - new Date(meta.lastInboundAt).getTime();
    if (age < STALE_MS) continue;

    // Admin has replied since the last inbound → not unanswered
    if (meta.lastOutboundAt && meta.lastOutboundAt >= meta.lastInboundAt) continue;

    // Already alerted for this exact inbound message
    if (meta.lastNotifiedSid && meta.lastNotifiedSid === meta.lastInboundSid) continue;

    const mins = Math.max(1, Math.round(age / 60_000));
    const label = meta.renterName || meta.renterPhone || 'a customer';
    alerts.push({ label: `${label} (${mins}m ago)`, sid, unmatched: false });

    await fbPatch(`/conversations/${sid}/meta`, { lastNotifiedSid: meta.lastInboundSid });
  }

  // ── Unmatched messages ────────────────────────────────────────────────────
  const unmatched = await fbGet('/conversations/unmatched');
  if (unmatched && typeof unmatched === 'object') {
    for (const [msgSid, msg] of Object.entries(unmatched)) {
      if (!msg?.timestamp || msg.notified) continue;
      const age = now - new Date(msg.timestamp).getTime();
      if (age < STALE_MS) continue;

      const mins = Math.max(1, Math.round(age / 60_000));
      alerts.push({ label: `unknown # (${mins}m ago)`, sid: null, unmatched: true });
      await fbPatch(`/conversations/unmatched/${msgSid}`, { notified: true });
    }
  }

  if (alerts.length === 0) {
    console.log('[unanswered-chat] No unanswered messages.');
    return Response.json({ alerted: 0 });
  }

  // ── Send one SMS burst to all owner phones ────────────────────────────────
  const count = alerts.length;
  const names = alerts.map(a => a.label).join(', ');
  const smsBody = `FTU: ${count} unanswered chat${count > 1 ? 's' : ''} – ${names}. fullthrottleutah.com/admin`;

  const ownerPhones = (process.env.OWNER_PHONE_NUMBER || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  let sent = 0;
  for (const phone of ownerPhones) {
    const result = await sendSMS(phone, smsBody);
    if (result.success) sent++;
    else console.warn('[unanswered-chat] SMS failed for', phone, '—', result.error);
  }

  console.log(`[unanswered-chat] ${count} alert(s) → ${sent}/${ownerPhones.length} phones.`);
  return Response.json({ alerted: count, smsSent: sent });
}
