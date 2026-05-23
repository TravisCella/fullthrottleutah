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

export function buildBookingConfirmationSMS(booking) {
  return [
    `✅ Full Throttle Utah booking confirmed!`,
    ``,
    `${booking.package} — ${booking.location}`,
    `Dates: ${booking.start_date}${booking.end_date && booking.end_date !== booking.start_date ? ' → ' + booking.end_date : ''}`,
    `Pickup: 8 AM, Farmington, UT`,
    ``,
    `Rental paid: $${booking.total_price}`,
    `At pickup: $1,000 security deposit (card hold or cash)`,
    ``,
    `Bring: driver's license, 2" ball hitch, 4-prong light hookup.`,
    ``,
    `Questions? Reply STOP to opt out. Call 714-856-5676.`,
  ].join('\n');
}
