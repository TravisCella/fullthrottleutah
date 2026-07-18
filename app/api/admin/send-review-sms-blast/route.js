import { google } from 'googleapis';
import { sendSMS } from '../../../../lib/sms';

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SITE_URL = 'https://fullthrottleutah.com';

function getSheets() {
  let credentials;
  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
    );
  } else {
    credentials = {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
  }
  const auth = new google.auth.JWT(credentials.client_email, null, credentials.private_key, [
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
  return google.sheets({ version: 'v4', auth });
}

export async function POST(request) {
  try {
    const { password, dryRun } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sheets = getSheets();

    // ── Read Sheet1: booking_id, renter_name, renter_phone, status, sms_opt_in ──
    const bookingsRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:R',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const bookingRows = bookingsRes.data.values || [];

    // ── Read Reviews tab: get set of booking_ids that already have a review ──
    let reviewedBookingIds = new Set();
    try {
      const reviewsRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Reviews!C:C',
        valueRenderOption: 'FORMATTED_VALUE',
      });
      const reviewRows = reviewsRes.data.values || [];
      for (let i = 1; i < reviewRows.length; i++) {
        const id = (reviewRows[i][0] || '').trim();
        if (id) reviewedBookingIds.add(id);
      }
    } catch (err) {
      console.warn('[review-sms-blast] Reviews tab read failed (continuing):', err.message);
    }

    // ── Build recipient list ──────────────────────────────────────────────────
    const seenPhones = new Set();
    const recipients = [];

    for (let i = 1; i < bookingRows.length; i++) {
      const row = bookingRows[i];
      const bookingId = (row[0] || '').trim(); // A
      const name = (row[9] || '').trim(); // J
      const phone = (row[11] || '').trim(); // L
      const status = (row[13] || '').trim(); // N
      const smsOptIn = (row[17] || '').trim().toUpperCase(); // R

      if (!bookingId || !phone) continue;
      if (status === 'CANCELLED') continue;
      if (smsOptIn !== 'YES') continue;
      if (reviewedBookingIds.has(bookingId)) continue;
      if (seenPhones.has(phone)) continue;

      seenPhones.add(phone);
      recipients.push({ bookingId, name, phone });
    }

    if (dryRun) {
      return Response.json({
        dryRun: true,
        count: recipients.length,
        recipients: recipients.map((r) => ({ name: r.name, phone: r.phone.slice(-4) })),
      });
    }

    // ── Send SMS to each recipient ────────────────────────────────────────────
    const results = [];
    for (const { bookingId, name, phone } of recipients) {
      const firstName = name.split(' ')[0] || 'there';
      const reviewUrl = `${SITE_URL}/review/${encodeURIComponent(bookingId)}`;
      const message = [
        `Hi ${firstName}! 🏄 How was your time on the water with Full Throttle Utah?`,
        ``,
        `We'd love a quick review — it takes 2 min and means the world to a small business:`,
        reviewUrl,
        ``,
        `Reply STOP to opt out.`,
      ].join('\n');

      const result = await sendSMS(phone, message);
      results.push({ name, phone: phone.slice(-4), ...result });
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;

    console.log(`[review-sms-blast] sent=${sent} failed=${failed} total=${recipients.length}`);

    return Response.json({ success: true, sent, failed, total: recipients.length, results });
  } catch (err) {
    console.error('[review-sms-blast] error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
