// lib/sms.js
// Version: 2026-06-01 — Defensive multi-recipient handling
// Last edited: June 1 2026
// Change: sendSMS() now accepts a single phone, a comma-separated string of phones, OR
//         an array. Multi-recipient inputs are split and sent one-per-API-call (Twilio
//         requires one phone per request — comma-separated values in `To` fail with
//         error 21211). Also fixed formatPhoneNumber() to handle commas safely when
//         the input starts with "+".
//
// This fixes the Twilio error 21211 we saw when something was passing the raw
// OWNER_PHONE_NUMBER env var ("+18015481273,+17143434959,+14358007484") directly to
// sendSMS without splitting it. The webhook does split correctly, but at least one
// other caller didn't — defending at the source means it can never happen again.

const TWILIO_API_URL = 'https://api.twilio.com/2010-04-01';

function getCredentials() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_PHONE_NUMBER,
  };
}

// Format a SINGLE phone string into E.164 format (+1XXXXXXXXXX for US)
// Callers should not pass comma-separated strings here — splitToList() handles that
// upstream. But guard anyway: if commas slip in, return null so the bad value can't reach
// Twilio.
function formatPhoneNumber(phone) {
  if (!phone) return null;
  // Reject anything that looks like multiple phones — should have been split already
  if (phone.includes(',')) {
    console.warn('[sms] formatPhoneNumber rejected multi-phone input:', phone);
    return null;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) {
    // After this point we know there are no commas, so it's safe to return as-is
    // ONLY if the digit count is plausible. Reject obvious garbage.
    if (digits.length < 10 || digits.length > 15) {
      console.warn('[sms] formatPhoneNumber rejected suspicious E.164 input:', phone);
      return null;
    }
    return phone;
  }
  if (digits.length < 10 || digits.length > 15) {
    console.warn('[sms] formatPhoneNumber rejected suspicious bare-digits input:', phone);
    return null;
  }
  return `+${digits}`;
}

// Normalize any input shape into a clean list of E.164 phone strings.
// Accepts: a single phone string, a comma-separated string, or an array.
function splitToList(input) {
  if (!input) return [];
  let rawList = [];

  if (Array.isArray(input)) {
    rawList = input;
  } else if (typeof input === 'string') {
    rawList = input.split(',');
  } else {
    return [];
  }

  return rawList
    .map(p => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .map(formatPhoneNumber)
    .filter(Boolean);
}

// Send to a single, already-formatted phone. Internal helper.
async function sendOne(to, body) {
  const { accountSid, authToken, fromNumber } = getCredentials();
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', fromNumber);
    params.append('Body', body);

    const res = await fetch(`${TWILIO_API_URL}/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[sms] Twilio error for', to, ':', data);
      return { to, success: false, error: data };
    }
    console.log('[sms] sent:', { to, sid: data.sid });
    return { to, success: true, sid: data.sid };
  } catch (err) {
    console.error('[sms] send error for', to, ':', err);
    return { to, success: false, error: err.message };
  }
}

// Main public API — defensive against single phones, comma-separated strings, and arrays.
// Returns:
//   - For single recipient: { success, sid }  or  { error, skipped }
//   - For multi recipient:  { success, sent, failed, results: [...] }
export async function sendSMS(toInput, message) {
  const { accountSid, authToken, fromNumber } = getCredentials();
  if (!accountSid || !authToken || !fromNumber) {
    console.log('[sms] Twilio credentials not configured, skipping SMS');
    return { skipped: true, reason: 'no_credentials' };
  }

  const recipients = splitToList(toInput);
  if (recipients.length === 0) {
    console.log('[sms] no valid phone numbers, skipping SMS. Input was:', toInput);
    return { skipped: true, reason: 'no_valid_phones' };
  }

  // Single recipient — preserve the original return shape so existing callers keep working
  if (recipients.length === 1) {
    return sendOne(recipients[0], message);
  }

  // Multi recipient — send sequentially and aggregate results
  const results = [];
  for (const phone of recipients) {
    const r = await sendOne(phone, message);
    results.push(r);
  }
  const sent = results.filter(r => r.success).length;
  const failed = results.length - sent;
  return {
    success: failed === 0,
    sent,
    failed,
    results,
  };
}

// Renter-facing confirmation SMS (sent to the person who booked)
export function buildBookingConfirmationSMS(booking) {
  const lines = [
    `✅ Full Throttle Utah booking confirmed!`,
    ``,
    `${booking.package} — ${booking.location}`,
    `Dates: ${booking.start_date}${booking.end_date && booking.end_date !== booking.start_date ? ' → ' + booking.end_date : ''}`,
  ];

  // White-glove customers get a different pickup instruction
  if (booking.white_glove) {
    lines.push(`🤝 White Glove Delivery — we deliver, launch & retrieve`);
    lines.push(`We'll be in touch to confirm delivery details.`);
  } else {
    lines.push(`Pickup: 8 AM, Farmington, UT`);
  }

  lines.push(``);
  lines.push(`Rental paid: $${booking.total_price}`);
  lines.push(`At pickup: $1,000 security deposit (card hold or cash)`);
  lines.push(``);

  if (booking.white_glove) {
    lines.push(`Bring: driver's license. We handle everything else.`);
  } else {
    lines.push(`Bring: driver's license, 2" ball hitch, 4-prong light hookup.`);
  }

  lines.push(``);
  lines.push(`Questions? Reply STOP to opt out. Call 714-856-5676.`);

  return lines.join('\n');
}

// Owner-facing alert SMS (sent to Travis when a booking comes in)
export function buildOwnerNotificationSMS(booking) {
  const lines = [
    `🛎️ New booking!${booking.white_glove ? ' 🤝 WHITE GLOVE' : ''}`,
    `${booking.package}`,
    `${booking.location}`,
    `${booking.start_date}${booking.end_date && booking.end_date !== booking.start_date ? ' → ' + booking.end_date : ''}`,
    `Renter: ${booking.renter_name} (${booking.renter_phone})`,
    `Paid: $${booking.total_price}`,
  ];

  // Add helpful flags when applicable
  if (booking.white_glove) {
    lines.push(`🤝 You deliver, launch & retrieve`);
  }
  if (booking.holiday_surcharge && Number(booking.holiday_surcharge) > 0) {
    lines.push(`🎆 Holiday surcharge: +$${booking.holiday_surcharge}`);
  }
  if (booking.loyalty_discount && Number(booking.loyalty_discount) > 0) {
    lines.push(`✨ Repeat customer (-$${booking.loyalty_discount})`);
  }

  return lines.join('\n');
}
