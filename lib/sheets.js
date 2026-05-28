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
    booking.white_glove ? 'YES' : 'NO',
    booking.holiday_surcharge ? `$${booking.holiday_surcharge}` : '$0',
    booking.loyalty_discount ? `-$${booking.loyalty_discount}` : '$0',
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:Q',
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
  const normalizedPhone = phone ? phone.replace(/\D/g, '') : null; // Strip non-digits for comparison
  
  // Need at least 10 digits for valid phone match (avoid matching empty/partial phones)
  const phoneToMatch = normalizedPhone && normalizedPhone.length >= 10 
    ? normalizedPhone.slice(-10) // Take last 10 digits to handle country code variations
    : null;
  
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!K:N', // columns K=email, L=phone, M=experience, N=status
    });
    
    const rows = res.data.values || [];
    if (rows.length <= 1) return false; // Header only or empty
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowEmail = (row[0] || '').toLowerCase().trim();
      const rowPhoneRaw = (row[1] || '').replace(/\D/g, '');
      const rowPhone = rowPhoneRaw.length >= 10 ? rowPhoneRaw.slice(-10) : null;
      const status = row[3];
      
      // Skip cancelled bookings
      if (status === 'CANCELLED') continue;
      
      // Match on email
      if (normalizedEmail && rowEmail && rowEmail === normalizedEmail) {
        return true;
      }
      
      // Match on phone (last 10 digits)
      if (phoneToMatch && rowPhone && rowPhone === phoneToMatch) {
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.error('isRepeatCustomer check failed:', err.message);
    return false; // Fail safe — don't apply discount if check fails
  }
}

// Log an inspection submission to the "Inspections" tab
// Creates the tab on first call (column headers will be added once manually)
export async function logInspection(data) {
  try {
    const sheets = getSheets();
    
    const values = [[
      data.timestamp,
      data.type,                // 'customer' (check-out) or 'owner' (check-in)
      data.inspectionId,        // the Firebase inspection ID
      data.customerName,
      data.machineName,
      data.rentalDate,
      data.photoCount,
      data.damageNotes || '',   // joined notes string
      data.fuelOk || '',        // YES / NO / ''
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
// Returns sorted by timestamp DESC (newest first)
export async function getRecentInspections(daysBack = 30) {
  try {
    const sheets = getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Inspections!A:K',
    });
    
    const rows = res.data.values || [];
    if (rows.length <= 1) return []; // Just header or empty
    
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    
    const inspections = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const tsStr = row[0];
      if (!tsStr) continue;
      
      // Try to parse the timestamp; if unparseable, include it anyway
      const tsDate = new Date(tsStr);
      if (!isNaN(tsDate.getTime()) && tsDate < cutoff) continue;
      
      inspections.push({
        timestamp: row[0] || '',
        type: row[1] || '',
        inspectionId: row[2] || '',
        customerName: row[3] || '',
        machineName: row[4] || '',
        rentalDate: row[5] || '',
        photoCount: parseInt(row[6], 10) || 0,
        damageNotes: row[7] || '',
        fuelOk: row[8] || '',
        hourMeter: row[9] || '',
        globalNote: row[10] || '',
      });
    }
    
    // Sort newest first
    inspections.sort((a, b) => {
      const aD = new Date(a.timestamp);
      const bD = new Date(b.timestamp);
      return bD - aD;
    });
    
    return inspections;
  } catch (err) {
    // If tab doesn't exist yet, return empty array (won't break the app)
    console.log('getRecentInspections — Inspections tab not found or empty:', err.message);
    return [];
  }
}

// Convert any date format from Google Sheets into YYYY-MM-DD string
function normalizeDate(input) {
  if (!input) return null;
  const str = input.toString().trim();
  if (!str) return null;

  // Already YYYY-MM-DD - return as-is (don't parse through Date to avoid timezone issues)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Handle M/D/YYYY or MM/DD/YYYY (US format from Google Sheets) - parse manually
  const usMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // For other formats (like "May 24, 2026"), use Date parsing
  const date = new Date(str);
  if (isNaN(date.getTime())) return str;

  // Use UTC methods to avoid timezone shifting
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
