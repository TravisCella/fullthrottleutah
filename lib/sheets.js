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
    booking.booking_id,          // A
    new Date().toISOString(),    // B date_booked
    booking.package,             // C
    booking.location,            // D
    booking.start_date,          // E
    booking.end_date,            // F
    booking.days,                // G
    booking.total_price,         // H
    booking.deposit_paid,        // I
    booking.renter_name,         // J
    booking.renter_email,        // K
    booking.renter_phone,        // L
    booking.experience,          // M
    'CONFIRMED',                 // N status
    booking.white_glove ? 'YES' : 'NO',                              // O
    booking.holiday_surcharge ? `$${booking.holiday_surcharge}` : '$0', // P
    booking.loyalty_discount ? `-$${booking.loyalty_discount}` : '$0',  // Q
    booking.sms_consent ? 'YES' : 'NO',                              // R sms_opt_in
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:R',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

// Returns all CONFIRMED bookings where start_date = tomorrow (Mountain Time)
// Used by the pickup-reminder cron job
export async function getTomorrowsBookings() {
  const sheets = getSheets();

  // Compute tomorrow's date in Mountain Time (UTC-6 standard / UTC-7 daylight)
  // Vercel cron runs at 14:00 UTC = 8:00 AM MDT (summer) / 7:00 AM MST (winter)
  // We add the offset manually so "tomorrow" is always correct for Utah
  const now = new Date();
  // Mountain Time is UTC-6 (MDT, summer) or UTC-7 (MST, winter)
  // Simple approach: offset by 6 hours (MDT) — close enough for 8 AM fire
  const mountainOffset = -6 * 60; // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const mountainMinutes = utcMinutes + mountainOffset;
  const mountainDate = new Date(now);
  mountainDate.setUTCMinutes(mountainDate.getUTCMinutes() + mountainOffset);

  const tomorrow = new Date(mountainDate);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`[pickup-reminder] Looking for bookings on ${tomorrowStr}`);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:R',
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  const bookings = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const startDate = normalizeDate(row[4]);  // col E
    const status    = (row[13] || '').trim(); // col N
    const smsOptIn  = (row[17] || '').trim().toUpperCase(); // col R

    if (status === 'CANCELLED') continue;
    if (startDate !== tomorrowStr) continue;

    bookings.push({
      booking_id:   row[0]  || '',
      package:      row[2]  || '',
      location:     row[3]  || '',
      start_date:   row[4]  || '',
      end_date:     row[5]  || '',
      days:         row[6]  || '',
      total_price:  row[7]  || '',
      renter_name:  row[9]  || '',
      renter_email: row[10] || '',
      renter_phone: row[11] || '',
      white_glove:  (row[14] || '').trim().toUpperCase() === 'YES',
      sms_opt_in:   smsOptIn === 'YES',
    });
  }

  console.log(`[pickup-reminder] Found ${bookings.length} booking(s) for tomorrow`);
  return bookings;
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
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const blockRows = blocksRes.data.values || [];
    if (blockRows.length > 1) {
      for (let i = 1; i < blockRows.length; i++) {
        const row = blockRows[i];
        const startDate = normalizeDate(row[0]);
        const endDate = normalizeDate(row[1]);
        const blockPkg = (row[2] || 'ALL').toString().trim();
        const reason = row[3] || 'Unavailable';

        if (!startDate) continue;

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
    console.log('Blocks tab not found or empty (this is OK):', err.message);
  }

  return bookedDates;
}

// Get premium dates (holidays, special events) from "Premiums" tab
export async function getPremiumDates(packageId) {
  const sheets = getSheets();
  const premiums = [];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Premiums!A:E',
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return premiums;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const startDate = normalizeDate(row[0]);
      const endDate = normalizeDate(row[1]);
      const premiumPkg = (row[2] || 'ALL').toString().trim();
      const premiumRaw = (row[3] || '').toString().trim();
      const reason = row[4] || 'Premium pricing';

      if (!startDate || !premiumRaw) continue;

      if (packageId && premiumPkg.toUpperCase() !== 'ALL') {
        const pkgLower = packageId.toLowerCase();
        const premLower = premiumPkg.toLowerCase();
        const matches = pkgLower.includes(premLower) || premLower.includes(pkgLower);
        if (!matches) continue;
      }

      let multiplier = 1;
      let flatAdd = 0;
      const cleaned = premiumRaw.replace(/[+\s]/g, '');
      if (cleaned.includes('%')) {
        const pct = parseFloat(cleaned.replace('%', ''));
        if (!isNaN(pct)) multiplier = 1 + (pct / 100);
      } else {
        const flat = parseFloat(cleaned);
        if (!isNaN(flat)) flatAdd = flat;
      }

      premiums.push({
        start: startDate,
        end: endDate || startDate,
        package: premiumPkg,
        multiplier,
        flatAdd,
        rawDisplay: premiumRaw,
        reason,
      });
    }
  } catch (err) {
    console.log('Premiums tab not found or empty (this is OK):', err.message);
  }

  return premiums;
}

// Check if a customer is a returning customer based on email OR phone match
// Matches against any non-cancelled booking in the sheet
export async function isRepeatCustomer(email, phone) {
  if (!email && !phone) return false;
  
  const normalizedEmail = email ? email.toLowerCase().trim() : null;
  const normalizedPhone = phone ? phone.replace(/\D/g, '') : null;
  
  const phoneToMatch = normalizedPhone && normalizedPhone.length >= 10 
    ? normalizedPhone.slice(-10)
    : null;
  
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!K:N', // columns K=email, L=phone, M=experience, N=status
    });
    
    const rows = res.data.values || [];
    if (rows.length <= 1) return false;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowEmail = (row[0] || '').toLowerCase().trim();
      const rowPhoneRaw = (row[1] || '').replace(/\D/g, '');
      const rowPhone = rowPhoneRaw.length >= 10 ? rowPhoneRaw.slice(-10) : null;
      const status = row[3];
      
      if (status === 'CANCELLED') continue;
      
      if (normalizedEmail && rowEmail && rowEmail === normalizedEmail) {
        return true;
      }
      
      if (phoneToMatch && rowPhone && rowPhone === phoneToMatch) {
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.error('isRepeatCustomer check failed:', err.message);
    return false;
  }
}

// Log an inspection submission to the "Inspections" tab
export async function logInspection(data) {
  try {
    const sheets = getSheets();
    
    const values = [[
      data.timestamp,
      data.type,
      data.inspectionId,
      data.customerName,
      data.machineName,
      data.rentalDate,
      data.photoCount,
      data.damageNotes || '',
      data.fuelOk || '',
      data.hourMeter || '',
      data.globalNote || '',
    ]];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Inspections!A:K',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    
    return { success: true };
  } catch (err) {
    console.error('logInspection error:', err.message);
    throw err;
  }
}

// Get recent inspections from the "Inspections" tab (last N days)
export async function getRecentInspections(daysBack = 30) {
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Inspections!A:K',
    });
    
    const rows = res.data.values || [];
    if (rows.length <= 1) return [];
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    
    const inspections = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const tsStr = row[0];
      if (!tsStr) continue;
      
      const tsDate = new Date(tsStr);
      if (!isNaN(tsDate.getTime()) && tsDate < cutoff) continue;
      
      inspections.push({
        timestamp:    row[0]  || '',
        type:         row[1]  || '',
        inspectionId: row[2]  || '',
        customerName: row[3]  || '',
        machineName:  row[4]  || '',
        rentalDate:   row[5]  || '',
        photoCount:   parseInt(row[6], 10) || 0,
        damageNotes:  row[7]  || '',
        fuelOk:       row[8]  || '',
        hourMeter:    row[9]  || '',
        globalNote:   row[10] || '',
      });
    }
    
    inspections.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return inspections;
  } catch (err) {
    console.log('getRecentInspections — Inspections tab not found or empty:', err.message);
    return [];
  }
}

// Convert any date format from Google Sheets into YYYY-MM-DD string
function normalizeDate(input) {
  if (!input) return null;
  const str = input.toString().trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const date = new Date(str);
  if (isNaN(date.getTime())) return str;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
