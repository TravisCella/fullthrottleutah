// lib/sms.js
// Version: 2026-06-02 PM — Use selected pickup time in customer confirmation SMS
// Last edited: June 2 2026 (evening)
// Change: buildBookingConfirmationSMS() now uses booking.pickup_time_display
//         instead of the hardcoded "8 AM" string. Falls back to "8:00 AM" if
//         the field is absent (for any pre-feature bookings). buildOwnerNotificationSMS()
//         also adds a "⏰ Pickup → Return" line for consistency with the inline
//         owner SMS that the webhook actually sends.
//
// Builds on: lib-sms_2026-06-02_surface-vest-data.js

const TWILIO_API_URL = 'https://api.twilio.com/2010-04-01';

function getCredentials() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_PHONE_NUMBER,
  };
}

// Format a SINGLE phone string into E.164 format (+1XXXXXXXXXX for US)
function formatPhoneNumber(phone) {
  if (!phone) return null;
  if (phone.includes(',')) {
    console.warn('[sms] formatPhoneNumber rejected multi-phone input:', phone);
    return null;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) {
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

  if (recipients.length === 1) {
    return sendOne(recipients[0], message);
  }

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

  if (booking.white_glove) {
    lines.push(`🤝 White Glove Delivery — we deliver, launch & retrieve`);
    lines.push(`Delivery: ${booking.pickup_time_display || '8:00 AM'} · Retrieval: ${booking.return_time_display || '8:00 PM'}`);
    lines.push(`We'll be in touch to confirm details.`);
  } else {
    lines.push(`Pickup: ${booking.pickup_time_display || '8:00 AM'}, Farmington, UT`);
    lines.push(`Return: ${booking.return_time_display || '8:00 PM'}`);
  }

  // NEW (2026-06-02): vest line — only added if customer's selection is present
  if (booking.vest_summary) {
    lines.push(`🦺 Vests: ${booking.vest_summary}`);
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
// NOTE: The webhook currently builds the owner SMS inline rather than calling
// this helper. Updating it here anyway so the two stay in sync if anything
// switches over.
export function buildOwnerNotificationSMS(booking) {
  const lines = [
    `🛎️ New booking!${booking.white_glove ? ' 🤝 WHITE GLOVE' : ''}`,
    `${booking.package}`,
    `${booking.location}`,
    `${booking.start_date}${booking.end_date && booking.end_date !== booking.start_date ? ' → ' + booking.end_date : ''}`,
    `⏰ ${booking.pickup_time_display || '8:00 AM'} → ${booking.return_time_display || '8:00 PM'}`,
    `Renter: ${booking.renter_name} (${booking.renter_phone})`,
    `Paid: $${booking.total_price}`,
  ];

  if (booking.white_glove) {
    lines.push(`🤝 You deliver, launch & retrieve`);
  }
  if (booking.holiday_surcharge && Number(booking.holiday_surcharge) > 0) {
    lines.push(`🎆 Holiday surcharge: +$${booking.holiday_surcharge}`);
  }
  if (booking.loyalty_discount && Number(booking.loyalty_discount) > 0) {
    lines.push(`✨ Repeat customer (-$${booking.loyalty_discount})`);
  }

  // NEW (2026-06-02): vest line with (default) suffix when customer skipped
  if (booking.vest_summary) {
    const defaultTag = booking.vest_used_default ? ' (default)' : '';
    lines.push(`🦺 ${booking.vest_summary}${defaultTag}`);
  }

  return lines.join('\n');
}
