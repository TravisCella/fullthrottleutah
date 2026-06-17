import { google } from 'googleapis';
import { getDepositAmount } from './deposit';

function getAuth() {
  let credentials;
  
  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
    credentials = JSON.parse(decoded);
  } else {
    credentials = {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
  }

  return new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/calendar']
  );
}

function parseRentalDate(dateStr) {
  // dateStr comes in like "Thu, May 21" — we need to add the current year
  // and parse to a proper date
  const now = new Date();
  const year = now.getFullYear();
  const cleaned = dateStr.replace(/^[A-Za-z]+,\s*/, ''); // remove "Thu, "
  const parsed = new Date(`${cleaned}, ${year}`);
  
  // If the parsed date is in the past by more than 30 days, it's probably next year
  if (parsed < new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) {
    parsed.setFullYear(year + 1);
  }
  
  return parsed;
}

function formatDateForCalendar(date) {
  // Format as YYYY-MM-DD for all-day events
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function createBookingEvent(booking) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    console.log('No calendar ID configured, skipping');
    return;
  }

  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const startDate = parseRentalDate(booking.start_date);
  const endDate = parseRentalDate(booking.end_date || booking.start_date);
  
  // For all-day events, end date needs to be the day AFTER the last rental day
  const endDatePlusOne = new Date(endDate);
  endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);

  const emoji = booking.package?.includes('GTX') ? '👑' : '⚡';
  const depositAmount = getDepositAmount(booking.package);
  const dueAtPickup = Number(booking.total_price) - Number(booking.deposit_paid) + depositAmount;

  const event = {
    summary: `${emoji} ${booking.package} — ${booking.location}`,
    description: [
      `RENTER: ${booking.renter_name}`,
      `PHONE: ${booking.renter_phone}`,
      `EMAIL: ${booking.renter_email}`,
      `EXPERIENCE: ${booking.experience}`,
      ``,
      `PACKAGE: ${booking.package}`,
      `LOCATION: ${booking.location}`,
      `DAYS: ${booking.days}`,
      ``,
      `TOTAL PRICE: $${booking.total_price}`,
      `DEPOSIT PAID: $${booking.deposit_paid}`,
      `DUE AT PICKUP: $${dueAtPickup}`,
      `  (Remaining balance + $${depositAmount.toLocaleString()} security deposit)`,
      ``,
      `PICKUP: 8:00 AM from Farmington, UT`,
      `RETURN: 8:00 PM`,
      ``,
      `REMINDERS:`,
      `• Verify renter has 2" ball hitch + flat 4-prong light hookup`,
      `• Collect remaining balance + $${depositAmount.toLocaleString()} security deposit`,
      `• Check driver's license`,
      `• Conduct pre-departure safety briefing`,
      `• Verify signed waiver on file`,
      ``,
      `Booking ID: ${booking.booking_id}`,
    ].join('\n'),
    start: {
      date: formatDateForCalendar(startDate),
      timeZone: 'America/Denver',
    },
    end: {
      date: formatDateForCalendar(endDatePlusOne),
      timeZone: 'America/Denver',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 * 18 },  // 6 PM night before
        { method: 'popup', minutes: 60 * 2 },    // 2 hours before (6 AM day of)
      ],
    },
    colorId: booking.package?.includes('GTX') ? '5' : '7',  // 5=banana/gold, 7=peacock/blue
  };

  const result = await calendar.events.insert({
    calendarId: calendarId,
    resource: event,
  });

  console.log('Calendar event created:', result.data.id);
  return result.data;
}
