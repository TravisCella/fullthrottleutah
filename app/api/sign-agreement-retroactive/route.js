// app/api/sign-agreement-retroactive/route.js
// Version: 2026-06-10 — Retroactive signing API
// Created: June 10 2026
//
// PURPOSE:
// Records a customer's retroactive rental agreement signature against an
// existing booking. Used by /agreement/[bookingId]/sign for pre-Phase-2
// bookings (or any future case where signing happened outside the booking
// flow).
//
// EXPECTED REQUEST BODY:
//   {
//     bookingId: "cs_live_a1...",
//     agreementVersion: "v1.0.0",
//     signatureDataUrl: "data:image/png;base64,...",
//     checksJson: "{...}",
//     signedAt: "2026-06-10T03:45:00.000Z"
//   }
//
// WHAT IT DOES (in order):
//   1. Validate request body
//   2. Look up the booking in Sheet1 by booking_id (column A)
//   3. Reject if booking not found OR already signed
//   4. Save signature PNG to Firebase at /retroactive-signatures/{bookingId}
//   5. Update Sheet columns V (version) and W (signed = "YES")
//   6. Return success
//
// FIREBASE auth: uses FIREBASE_DATABASE_SECRET env var, same as save-inspection.
// SHEETS auth: uses GOOGLE_CREDENTIALS_BASE64 env var, same as everywhere else.

import { NextResponse } from 'next/server';
import { google } from 'googleapis';

const FIREBASE_DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    // ─── 1. Parse + validate body ──────────────────────────────
    const body = await request.json();
    const {
      bookingId,
      agreementVersion,
      signatureDataUrl,
      checksJson,
      signedAt,
    } = body || {};

    if (!bookingId || !agreementVersion || !signatureDataUrl || !checksJson || !signedAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!signatureDataUrl.startsWith('data:image/')) {
      return NextResponse.json(
        { error: 'Invalid signature format' },
        { status: 400 }
      );
    }

    // ─── 2. Auth to Google Sheets ──────────────────────────────
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
    );
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    // ─── 3. Find the row for this booking ──────────────────────
    // Read column A (booking_id) AND column W (already-signed flag) to verify
    // the booking exists and isn't already signed.
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:W',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const rows = readRes.data.values || [];

    let rowIndex = -1; // 1-indexed for Sheets API
    let existingSigned = '';
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] || '').trim() === bookingId.trim()) {
        rowIndex = i + 1;
        existingSigned = (rows[i][22] || '').toString(); // W = col index 22 (0-indexed)
        break;
      }
    }

    if (rowIndex === -1) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Idempotency: don't allow re-signing
    if (existingSigned.toUpperCase().startsWith('YES')) {
      return NextResponse.json(
        { error: 'This booking has already been signed' },
        { status: 409 }
      );
    }

    // ─── 4. Save signature to Firebase ─────────────────────────
    const firebaseSecret = process.env.FIREBASE_DATABASE_SECRET;
    if (!firebaseSecret) {
      console.error('[sign-agreement-retroactive] Missing FIREBASE_DATABASE_SECRET env var');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const fbPath = `${FIREBASE_DB_URL}/retroactive-signatures/${encodeURIComponent(bookingId)}.json?auth=${firebaseSecret}`;
    const fbPayload = {
      bookingId,
      agreementVersion,
      signedAt,
      signatureDataUrl,
      checksJson,
      userAgent: request.headers.get('user-agent') || 'unknown',
      ipHash: hashIp(request.headers.get('x-forwarded-for') || ''),
      recordedAt: new Date().toISOString(),
    };

    const fbRes = await fetch(fbPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fbPayload),
    });

    if (!fbRes.ok) {
      const text = await fbRes.text().catch(() => '');
      console.error('[sign-agreement-retroactive] Firebase write failed:', fbRes.status, text);
      return NextResponse.json(
        { error: 'Failed to save signature (Firebase). Please try again.' },
        { status: 500 }
      );
    }

    // ─── 5. Update Sheet columns V + W ─────────────────────────
    // V = rental_agreement_version (e.g. "v1.0.0")
    // W = rental_agreement_signed (we use "YES" — matches Phase 2's marker)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!V${rowIndex}:W${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[agreementVersion, 'YES']],
      },
    });

    // ─── 6. Done ───────────────────────────────────────────────
    return NextResponse.json({ ok: true, rowIndex });
  } catch (err) {
    console.error('[sign-agreement-retroactive] error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Lightweight IP hash for audit purposes — we don't store raw IPs.
// Just enough to verify "same user revisited" without PII.
function hashIp(ip) {
  if (!ip) return '';
  // Simple FNV-1a hash, not cryptographic — just for non-identifying audit
  let h = 2166136261;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
