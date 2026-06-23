// app/api/cron/win-back/route.js
// Abandoned-checkout win-back cron.
// Triggered every 15 min by GitHub Actions (not Vercel cron).
// Auth: Authorization: Bearer CRON_SECRET
//
// Flow per eligible record:
//   1. Confirm session is still "open" in Stripe (skips completed + expired in one check)
//   2. Send Resend nudge email (always, if renterEmail present)
//   3. Send Twilio SMS (ONLY if smsOptIn === "true")
//   4. Send owner hot-lead SMS (OWNER_PHONE_NUMBER)
//   5. PATCH Firebase record: nudged=true, nudgedAt=ISO
//
// One record failure never aborts the loop — each is its own try/catch.

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sendWinBackEmail } from '../../../../lib/win-back-email';
import { sendSMS } from '../../../../lib/sms';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';
const NUDGE_DELAY_MS = 45 * 60 * 1000; // 45 minutes

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function patchPendingRecord(sessionId, fbSecret, updates) {
  const res = await fetch(
    `${FIREBASE_DB_URL}/pending-checkouts/${sessionId}.json?auth=${encodeURIComponent(fbSecret)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firebase PATCH failed ${res.status}: ${text}`);
  }
}

function buildRenterSMS(record, dates) {
  const firstName = (record.renterName || 'there').split(' ')[0];
  return (
    `Hi ${firstName}, it's Full Throttle Utah — you were almost booked for the ` +
    `${record.packageName} at ${record.location} (${dates}). ` +
    `Your spot isn't held until checkout's done. ` +
    `Finish here: ${record.checkoutUrl}  Reply STOP to opt out`
  );
}

function buildOwnerSMS(record, dates) {
  return [
    `🔥 Abandoned checkout — hot lead`,
    `${record.renterName || '(no name)'}`,
    `${record.packageName} · ${record.location} · ${dates}`,
    `📧 ${record.renterEmail || '—'}`,
  ].join('\n');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(request) {
  // ── CRON_SECRET guard — identical fail-closed pattern to existing crons ────
  if (!process.env.CRON_SECRET) {
    console.error('[win-back] CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Firebase read ─────────────────────────────────────────────────────────
  const fbSecret = process.env.FIREBASE_DATABASE_SECRET;
  if (!fbSecret) {
    console.error('[win-back] FIREBASE_DATABASE_SECRET not set — refusing to run');
    return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 });
  }

  let allRecords;
  try {
    const fbRes = await fetch(
      `${FIREBASE_DB_URL}/pending-checkouts.json?auth=${encodeURIComponent(fbSecret)}`
    );
    if (!fbRes.ok) {
      const text = await fbRes.text();
      console.error('[win-back] Firebase read failed:', fbRes.status, text);
      return NextResponse.json({ error: 'Firebase read failed' }, { status: 500 });
    }
    allRecords = await fbRes.json(); // null when path is empty
  } catch (err) {
    console.error('[win-back] Firebase fetch threw:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  if (!allRecords) {
    return NextResponse.json({ nudged: 0, skipped: 0, message: 'No pending checkouts on record' });
  }

  // ── Filter candidates ─────────────────────────────────────────────────────
  const now = Date.now();
  const candidates = Object.values(allRecords).filter(
    (r) =>
      r.status === 'pending' &&
      r.nudged === false &&
      now - r.createdAt >= NUDGE_DELAY_MS &&
      now < r.expiresAt
  );

  console.log(`[win-back] ${Object.keys(allRecords).length} total records, ${candidates.length} candidates`);

  if (candidates.length === 0) {
    return NextResponse.json({ nudged: 0, skipped: 0, message: 'No eligible records this run' });
  }

  // ── Process each candidate independently ──────────────────────────────────
  let nudgedCount = 0;
  let skippedCount = 0;

  for (const record of candidates) {
    try {
      // ── 1. Confirm session is still open in Stripe ────────────────────────
      // status === "open"     → unpaid, URL still valid → send nudge
      // status === "complete" → paid (race: webhook hasn't marked Firebase yet) → skip
      // status === "expired"  → URL dead, nudge useless → skip
      let session;
      try {
        session = await stripe.checkout.sessions.retrieve(record.sessionId);
      } catch (stripeErr) {
        console.warn('[win-back] Could not retrieve session', record.sessionId, ':', stripeErr.message);
        skippedCount++;
        continue;
      }

      if (session.status !== 'open') {
        const newStatus = session.status === 'complete' ? 'completed' : 'expired';
        await patchPendingRecord(record.sessionId, fbSecret, { status: newStatus });
        console.log(`[win-back] Session ${record.sessionId} is ${session.status} — marked ${newStatus}, no nudge`);
        skippedCount++;
        continue;
      }

      const dates =
        record.endDate && record.endDate !== record.startDate
          ? `${record.startDate} → ${record.endDate}`
          : record.startDate;

      // ── 2. Claim the record before sending — belt-and-suspenders against
      //       overlapping cron runs both seeing nudged:false simultaneously.
      //       Tradeoff: if email/SMS fail after this PATCH, nudged stays true
      //       and the customer misses that one nudge. Acceptable — a missed
      //       nudge beats a double-text.
      await patchPendingRecord(record.sessionId, fbSecret, {
        nudged: true,
        nudgedAt: new Date().toISOString(),
      });

      // ── 3. Resend email (always, when email is present) ───────────────────
      if (record.renterEmail) {
        try {
          await sendWinBackEmail({
            renterEmail: record.renterEmail,
            renterName: record.renterName,
            packageName: record.packageName,
            location: record.location,
            startDate: record.startDate,
            endDate: record.endDate,
            checkoutUrl: record.checkoutUrl,
          });
        } catch (emailErr) {
          console.error('[win-back] Email failed for', record.renterEmail, ':', emailErr.message);
        }
      }

      // ── 4. Renter SMS (ONLY if opted in) ─────────────────────────────────
      if (record.smsOptIn === 'true' && record.renterPhone) {
        try {
          await sendSMS(record.renterPhone, buildRenterSMS(record, dates));
        } catch (smsErr) {
          console.error('[win-back] Renter SMS failed for', record.renterPhone, ':', smsErr.message);
        }
      }

      // ── 5. Owner hot-lead SMS ─────────────────────────────────────────────
      try {
        const ownerPhones = (process.env.OWNER_PHONE_NUMBER || '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
        if (ownerPhones.length > 0) {
          const ownerMsg = buildOwnerSMS(record, dates);
          for (const phone of ownerPhones) {
            await sendSMS(phone, ownerMsg);
          }
        }
      } catch (ownerErr) {
        console.error('[win-back] Owner SMS failed:', ownerErr.message);
      }

      console.log('[win-back] Nudged:', record.sessionId, record.renterEmail);
      nudgedCount++;
    } catch (recordErr) {
      console.error('[win-back] Unexpected error processing', record.sessionId, ':', recordErr.message);
      skippedCount++;
    }
  }

  console.log(`[win-back] Done — nudged: ${nudgedCount}, skipped: ${skippedCount}`);

  // ── Cleanup: delete records stale by > 7 days past expiry ────────────────
  // expiresAt is set to createdAt + 24h in checkout. 7-day grace means only
  // records 8+ days old are touched — nothing within the nudgeable window.
  const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
  try {
    const staleIds = Object.entries(allRecords)
      .filter(([, r]) => r.expiresAt < now - STALE_THRESHOLD_MS)
      .map(([id]) => id);

    if (staleIds.length > 0) {
      console.log(`[win-back] Deleting ${staleIds.length} stale record(s)`);
      for (const sessionId of staleIds) {
        try {
          const delRes = await fetch(
            `${FIREBASE_DB_URL}/pending-checkouts/${sessionId}.json?auth=${encodeURIComponent(fbSecret)}`,
            { method: 'DELETE' }
          );
          if (!delRes.ok) {
            console.warn(`[win-back] Stale delete failed for ${sessionId}: ${delRes.status}`);
          }
        } catch (delErr) {
          console.warn(`[win-back] Stale delete threw for ${sessionId}:`, delErr.message);
        }
      }
    }
  } catch (cleanupErr) {
    // Best-effort — cleanup failure never affects nudge results or the response
    console.error('[win-back] Cleanup pass failed:', cleanupErr.message);
  }

  return NextResponse.json({ nudged: nudgedCount, skipped: skippedCount });
}
