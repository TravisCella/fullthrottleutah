// app/api/inspection-submitted/route.js
// Version: 2026-06-01 — Split owner phones + use verified email domain
// Last edited: June 1 2026
//
// Changes vs prior version:
//   1. sendInspectionSMS() now splits OWNER_PHONE_NUMBER on commas and sends to each
//      number individually. Was passing the raw env var as one big "To" field, which
//      caused Twilio error 21211 ("Invalid To Phone Number"). Mirrors the same pattern
//      used by app/api/webhook/route.js for consistency.
//   2. sendInspectionEmail() now sends from bookings@fullthrottleutah.com (verified
//      domain at Resend) instead of onboarding@resend.dev. Without this, only Travis's
//      own gmail received inspection emails — any other owner email added to OWNER_EMAIL
//      would be blocked by Resend's free-tier sender restriction.
//
// Note: lib/sms.js was also hardened to split comma-separated strings itself, so even
// if someone forgot to split here, it would still work. This explicit split is
// belt-and-suspenders — clear intent at the call site.

import { NextResponse } from 'next/server';
import { sendSMS } from '../../../lib/sms';
import { logInspection } from '../../../lib/sheets';

async function sendInspectionEmail(data) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const OWNER_EMAIL = process.env.OWNER_EMAIL;

  if (!RESEND_KEY || !OWNER_EMAIL) {
    console.log('Resend key or owner email missing, skipping inspection email');
    return;
  }

  const typeLabel = data.type === 'customer' ? '📱 Customer Check-OUT' : '🔧 Owner Check-IN';
  const verdictColor = data.hasDamage ? '#c44' : '#1a8a5c';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: 'Full Throttle Inspect <bookings@fullthrottleutah.com>',
        to: OWNER_EMAIL,
        subject: `🔍 ${typeLabel} — ${data.customerName} · ${data.machineName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #111; padding: 20px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 18px;">FULL THROTTLE INSPECT</h1>
              <p style="color: #aaa; margin: 4px 0 0; font-size: 12px;">${typeLabel}</p>
            </div>
            <div style="padding: 20px; background: #f5f3ee; border: 1px solid #e0ddd5; border-top: none; border-radius: 0 0 12px 12px;">
              
              <div style="background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 11px; color: #777; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Inspection ID — Save this</div>
                <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #D85A30; word-break: break-all;">${data.inspectionId}</div>
              </div>

              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #777; font-size: 12px;">Customer</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.customerName}</td></tr>
                <tr><td style="padding: 6px 0; color: #777; font-size: 12px;">Machine</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.machineName}</td></tr>
                <tr><td style="padding: 6px 0; color: #777; font-size: 12px;">Rental Date</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.rentalDate || '—'}</td></tr>
                <tr><td style="padding: 6px 0; color: #777; font-size: 12px;">Photos Taken</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.photoCount}</td></tr>
                ${data.hourMeter ? `<tr><td style="padding: 6px 0; color: #777; font-size: 12px;">Hour Meter</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${data.hourMeter}</td></tr>` : ''}
                ${data.fuelOk !== null && data.fuelOk !== undefined ? `<tr><td style="padding: 6px 0; color: #777; font-size: 12px;">Fuel</td><td style="padding: 6px 0; font-weight: 600; text-align: right; color: ${data.fuelOk ? '#1a8a5c' : '#c44'}">${data.fuelOk ? '✅ Full' : '⛽ Refuel fee needed'}</td></tr>` : ''}
              </table>

              ${
                data.damageNotes && data.damageNotes.length > 0
                  ? `
                <div style="background: #fcebeb; border-left: 4px solid ${verdictColor}; border-radius: 6px; padding: 12px; margin-top: 14px;">
                  <div style="font-weight: 700; color: #991B1B; font-size: 13px; margin-bottom: 6px;">⚠️ Damage Notes Recorded:</div>
                  <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #991B1B;">
                    ${data.damageNotes.map((n) => `<li>${n}</li>`).join('')}
                  </ul>
                </div>
              `
                  : ''
              }

              ${
                data.globalNote
                  ? `
                <div style="background: #fff; border-radius: 8px; padding: 12px; margin-top: 14px; font-size: 12px;">
                  <div style="font-weight: 600; margin-bottom: 4px;">Overall Notes:</div>
                  <div style="color: #444;">${data.globalNote}</div>
                </div>
              `
                  : ''
              }

              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #e0ddd5; font-size: 11px; color: #777; text-align: center;">
                Submitted ${data.timestamp}<br/>
                <a href="https://www.fullthrottleutah.com/inspect" style="color: #D85A30;">Open inspection app</a>
              </div>
            </div>
          </div>
        `,
      }),
    });
    const result = await res.json();
    console.log('Inspection email sent:', result);
  } catch (err) {
    console.error('Inspection email error:', err);
  }
}

async function sendInspectionSMS(data) {
  // Split comma-separated owner phones the same way webhook/route.js does.
  // This is the FIX for Twilio error 21211 — passing the raw env var as a single
  // "To" field with commas in it would fail with "Invalid 'To' Phone Number".
  const ownerPhones = (process.env.OWNER_PHONE_NUMBER || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (ownerPhones.length === 0) {
    console.log('[inspection-submitted] No owner phone configured, skipping SMS');
    return;
  }

  const typeLabel = data.type === 'customer' ? 'CHECK-OUT' : 'CHECK-IN';

  const msg = [
    `🔍 ${typeLabel} submitted`,
    ``,
    `${data.customerName} · ${data.machineName}`,
    `${data.photoCount} photos`,
    ``,
    `Inspection ID:`,
    `${data.inspectionId}`,
    ``,
    `(Saved in inspection log)`,
  ].join('\n');

  // Send to each owner phone individually (Travis, wife, son)
  for (const phone of ownerPhones) {
    try {
      await sendSMS(phone, msg);
      console.log('[inspection-submitted] SMS sent to owner:', phone);
    } catch (err) {
      console.error('[inspection-submitted] SMS error for', phone, ':', err);
      // Continue with the remaining phones even if one fails
    }
  }
}

export async function POST(request) {
  try {
    const data = await request.json();

    if (!process.env.ADMIN_PASSWORD || data.password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Required fields
    if (!data.inspectionId || !data.type || !data.customerName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Log to Google Sheets (non-fatal if fails)
    try {
      await logInspection({
        timestamp:
          data.timestamp || new Date().toLocaleString('en-US', { timeZone: 'America/Denver' }),
        type: data.type, // 'customer' or 'owner'
        inspectionId: data.inspectionId,
        customerName: data.customerName,
        machineName: data.machineName || '',
        rentalDate: data.rentalDate || '',
        photoCount: data.photoCount || 0,
        damageNotes: (data.damageNotes || []).join('; '),
        fuelOk: data.fuelOk === true ? 'YES' : data.fuelOk === false ? 'NO' : '',
        hourMeter: data.hourMeter || '',
        globalNote: data.globalNote || '',
      });
    } catch (sheetErr) {
      console.error('Sheet log error (non-fatal):', sheetErr.message);
    }

    // Send email + SMS notification to owner in parallel
    await Promise.all([sendInspectionEmail(data), sendInspectionSMS(data)]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Inspection submission webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
