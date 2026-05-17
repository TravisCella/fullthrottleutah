
import { google } from 'googleapis';

function getAuth() {
  let credentials;
  
  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    // Decode the base64-encoded JSON credentials
    const decoded = Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
    credentials = JSON.parse(decoded);
  } else {
    credentials = {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
  }

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return auth;
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

export async function addBooking(booking) {
  const sheets = getSheets();
  const values = [[
    booking.booking_id,
    new Date().toISOString(),
    booking.package,
    booking.location,
    booking.start_date,
    booking.end_date,
    booking.days,
    booking.total_price,
    booking.deposit_paid,
    booking.renter_name,
    booking.renter_email,
    booking.renter_phone,
    booking.experience,
    'CONFIRMED',
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:N',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

export async function getBookedDates(packageId) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!C:N',
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return []; // header only

  const bookedDates = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const pkg = row[0]; // column C = package
    const startDate = row[2]; // column E = start_date
    const endDate = row[3]; // column F = end_date
    const status = row[11]; // column N = status

    if (status === 'CANCELLED') continue;

    // If packageId filter provided, only return dates for that package
    if (packageId && !pkg?.toLowerCase().includes(packageId.toLowerCase())) continue;

    if (startDate) {
      bookedDates.push({ start: startDate, end: endDate || startDate, package: pkg });
    }
  }
  return bookedDates;
}
