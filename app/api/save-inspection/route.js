// app/api/save-inspection/route.js
// Version: 2026-06-03 (initial) — Server-side proxy for Firebase inspection writes
// Created: June 3 2026
// Purpose: Replaces the browser's direct PUT to Firebase Realtime DB with a
//          server-side proxy. Browser POSTs the inspection record here; we
//          generate the ID + timestamp server-side and write to Firebase using
//          the FIREBASE_DATABASE_SECRET (legacy admin auth) which bypasses the
//          locked-down database rules.
//
// Required env: FIREBASE_DATABASE_SECRET
// Security note: This route is intentionally unauthenticated — it's the public
//                surface the inspect app posts to. The asymmetry that protects us:
//                a malicious actor would have to *guess valid inspection IDs* to
//                tamper with existing records, but IDs are generated server-side
//                here so there's no way to choose one. And direct Firebase
//                access is denied to everyone except this server.

import { NextResponse } from 'next/server';

const DB_URL = 'https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com';

// Mirror the timestamp format used by the legacy upload() in inspect/page.jsx
// so existing inspection records and new ones look identical.
function serverTimestamp() {
  return new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export async function POST(request) {
  try {
    const secret = process.env.FIREBASE_DATABASE_SECRET;
    if (!secret) {
      console.error('[save-inspection] FIREBASE_DATABASE_SECRET not configured in env');
      return NextResponse.json(
        { error: 'Server configuration error — secret missing' },
        { status: 500 }
      );
    }

    const record = await request.json();

    // Basic validation — reject obviously malformed requests
    if (!record || typeof record !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!record.role || !record.machineId) {
      return NextResponse.json(
        { error: 'Missing required fields (role, machineId)' },
        { status: 400 }
      );
    }

    // Server generates ID + timestamp — prevents clients from choosing an ID
    // that collides with an existing record, and avoids client clock skew.
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = serverTimestamp();
    const fullRecord = { ...record, id, timestamp };

    // Write to Firebase Realtime DB with admin auth (the legacy database secret
    // bypasses all rules, allowing the write even when rules deny everything).
    const writeRes = await fetch(
      `${DB_URL}/inspections/${id}.json?auth=${encodeURIComponent(secret)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullRecord),
      }
    );

    if (!writeRes.ok) {
      const errText = await writeRes.text();
      console.error('[save-inspection] Firebase write failed:', writeRes.status, errText);
      return NextResponse.json(
        { error: 'Failed to save inspection', status: writeRes.status },
        { status: 500 }
      );
    }

    console.log(
      `[save-inspection] Saved ${id} for ${record.customerName || '?'} (${record.machineName || '?'}, ${record.role})`
    );

    return NextResponse.json({ ok: true, id, timestamp });
  } catch (err) {
    console.error('[save-inspection] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
