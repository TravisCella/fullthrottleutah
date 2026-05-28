// Twilio SMS helper for Full Throttle Utah
// Uses direct HTTPS to avoid bundling the twilio SDK
const TWILIO_API_URL = 'https://api.twilio.com/2010-04-01';

function getCredentials() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_PHONE_NUMBER,
  };
}

function formatPhoneNumber(phone) {
  if (!phone) return null;
  // Strip all non-digits
  const digits = phone.replace(/\D/g, '');
  // If 10 digits, prepend +1 for US
  if (digits.length === 10) return `+1${digits}`;
  // If 11 digits starting with 1, add +
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // If already has country code somehow
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

export async function sendSMS(toPhone, message) {
  const { accountSid, authToken, fromNumber } = getCredentials();
  if (!accountSid || !authToken || !fromNumber) {
    console.log('Twilio credentials not configured, skipping SMS');
    return { skipped: true };
  }
  const to = formatPhoneNumber(toPhone);
  if (!to) {
    console.log('Invalid phone number, skipping SMS:', toPhone);
    return { skipped: true, reason: 'invalid_phone' };
  }
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', fromNumber);
    params.append('Body', message);
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
      console.error('Twilio error:', data);
      return { error: data };
    }
    console.log('SMS sent:', { to, sid: data.sid });
    return { success: true, sid: data.sid };
  } catch (err) {
    console.error('SMS send error:', err);
    return { error: err.message };
  }
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
