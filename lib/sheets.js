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
  const bookedDates = [];

  // Step 1: Real bookings from Sheet1
  if (rows.length > 1) {
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
  }

  // Step 2: Manual blocks from "Blocks" tab (for personal use, maintenance, weather, etc.)
  // Tab columns: A=Start Date, B=End Date, C=Package (or "ALL"), D=Reason, E=Notes
  try {
    const blocksRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Blocks!A:E',
      // Force values to be returned as formatted strings (handles date cells properly)
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const blockRows = blocksRes.data.values || [];
    if (blockRows.length > 1) {
      for (let i = 1; i < blockRows.length; i++) {
        const row = blockRows[i];
        const startDate = normalizeDate(row[0]); // column A
        const endDate = normalizeDate(row[1]);   // column B
        const blockPkg = (row[2] || 'ALL').toString().trim(); // column C
        const reason = row[3] || 'Unavailable'; // column D

        if (!startDate) continue;

        // If block targets a specific package, only apply when querying that package
        // "ALL" or empty = applies to all packages
        // Match in either direction so partial names like "GTX Limited" match "GTX Limited Duo"
        if (packageId && blockPkg.toUpperCase() !== 'ALL') {
          const pkgLower = packageId.toLowerCase();
          const blockLower = blockPkg.toLowerCase();
          const matches = pkgLower.includes(blockLower) || blockLower.includes(pkgLower);
          if (!matches) continue;
        }

        bookedDates.push({
          start: startDate,
          end: endDate || startDate,
          package: blockPkg,
          blocked: true,
          reason
        });
      }
    }
  } catch (err) {
    // If Blocks tab doesn't exist yet, fail silently — won't break the booking flow
    console.log('Blocks tab not found or empty (this is OK):', err.message);
  }

  return bookedDates;
}

// Convert any date format from Google Sheets into YYYY-MM-DD string
// Handles: "2026-05-22", "5/22/2026", "May 22, 2026", "22-May-2026", and serial numbers
function normalizeDate(input) {
  if (!input) return null;
  const str = input.toString().trim();
  if (!str) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Try to parse it
  let date;
  // Handle M/D/YYYY or MM/DD/YYYY (US format from Google Sheets)
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  } else {
    date = new Date(str);
  }

  if (isNaN(date.getTime())) return str; // Fallback: return raw string if can't parse

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
