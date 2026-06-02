import { google } from 'googleapis';

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

export async function getTomorrowsBookings() {
  const sheets = getSheets();
  const now = new Date();
  const mountainOffset = -6 * 60;
  const mountainDate = new Date(now);
  mountainDate.setUTCMinutes(mountainDate.getUTCMinutes() + mountainOffset);

  const tomorrow = new Date(mountainDate);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

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
    const startDate = normalizeDate(row[4]);
    const status    = (row[13] || '').trim();
    const smsOptIn  = (row[17] || '').trim().toUpperCase();

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

// ─── NEW: REVIEW FUNCTIONS (2026-06-02) ──────────────────────────────────────

// Look up a single booking by its booking_id (Stripe session ID).
// Used by the customer-facing review form to verify the link is valid and to
// personalize the page (renter's first name, package, lake, dates).
export async function getBookingById(bookingId) {
  if (!bookingId) return null;
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A:R',
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const rows = res.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '') === bookingId) {
      const row = rows[i];
      return {
        booking_id: row[0] || '',
        package: row[2] || '',
        location: row[3] || '',
        start_date: row[4] || '',
        end_date: row[5] || '',
        days: row[6] || '',
        renter_name: row[9] || '',
        renter_email: row[10] || '',
        renter_phone: row[11] || '',
        status: row[13] || '',
      };
    }
  }
  return null;
}

// Write a new review to the Reviews tab.
// Caller is responsible for setting the correct status (5-star = approved,
// 1-4 star = pending per current moderation policy).
export async function addReview(review) {
  const sheets = getSheets();
  const values = [[
    review.review_id,                                  // A
    new Date().toISOString(),                          // B timestamp_submitted
    review.booking_id,                                 // C
    review.customer_name,                              // D
    review.rating,                                     // E
    review.review_text,                                // F
    review.display_name,                               // G
    review.allow_publish ? 'YES' : 'NO',               // H
    review.private_note || '',                         // I
    review.status,                                     // J pending|approved|rejected
    '',                                                // K timestamp_moderated
    '',                                                // L moderator_notes
    review.location || '',                             // M
    review.package || '',                              // N
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Reviews!A:N',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

// Read reviews with optional filters. Returns sorted newest-first.
//   filter.status: 'pending' | 'approved' | 'rejected' | undefined (all)
//   filter.allowPublishOnly: true to exclude reviews where customer opted out
//   filter.minRating: only return rating >= N
export async function getReviews(filter = {}) {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Reviews!A:N',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) return [];

    const reviews = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const review = {
        review_id: row[0] || '',
        timestamp_submitted: row[1] || '',
        booking_id: row[2] || '',
        customer_name: row[3] || '',
        rating: parseInt(row[4], 10) || 0,
        review_text: row[5] || '',
        display_name: row[6] || '',
        allow_publish: (row[7] || '').toString().toUpperCase() === 'YES',
        private_note: row[8] || '',
        status: (row[9] || '').toString().toLowerCase(),
        timestamp_moderated: row[10] || '',
        moderator_notes: row[11] || '',
        location: row[12] || '',
        package: row[13] || '',
      };

      if (filter.status && review.status !== filter.status) continue;
      if (filter.allowPublishOnly && !review.allow_publish) continue;
      if (filter.minRating && review.rating < filter.minRating) continue;

      reviews.push(review);
    }

    reviews.sort((a, b) =>
      new Date(b.timestamp_submitted) - new Date(a.timestamp_submitted)
    );
    return reviews;
  } catch (err) {
    console.log('[reviews] Reviews tab not found or empty:', err.message);
    return [];
  }
}

// Look up a single review by booking_id — used to prevent double-submission.
export async function getReviewByBookingId(bookingId) {
  if (!bookingId) return null;
  const all = await getReviews();
  return all.find(r => r.booking_id === bookingId) || null;
}

// Update a review's moderation status. Returns true on success, throws if not found.
export async function updateReviewStatus(reviewId, newStatus, moderatorNotes = '') {
  if (!reviewId) throw new Error('Missing reviewId');
  if (!['approved', 'rejected', 'pending'].includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  const sheets = getSheets();
  // Find the row containing this review_id (column A)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Reviews!A:A',
  });
  const rows = res.data.values || [];
  let rowNumber = -1;
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '') === reviewId) {
      rowNumber = i + 1; // sheet rows are 1-indexed
      break;
    }
  }
  if (rowNumber === -1) {
    throw new Error(`Review ${reviewId} not found`);
  }

  // Update columns J (status), K (timestamp_moderated), L (moderator_notes)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Reviews!J${rowNumber}:L${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[newStatus, new Date().toISOString(), moderatorNotes]],
    },
  });

  return true;
}

// Update the display_name on a review (admin can clean up if customer typed weirdly).
export async function updateReviewDisplayName(reviewId, newDisplayName) {
  if (!reviewId) throw new Error('Missing reviewId');
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Reviews!A:A',
  });
  const rows = res.data.values || [];
  let rowNumber = -1;
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '') === reviewId) {
      rowNumber = i + 1;
      break;
    }
  }
  if (rowNumber === -1) throw new Error(`Review ${reviewId} not found`);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Reviews!G${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[newDisplayName]] },
  });

  return true;
}

// ─── (existing functions below — unchanged) ──────────────────────────────────

export async function getBookedDates(packageId) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!C:N',
  });

  const rows = res.data.values || [];
  const bookedDates = [];

  if (rows.length > 1) {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const pkg = row[0];
      const startDate = row[2];
      const endDate = row[3];
      const status = row[11];

      if (status === 'CANCELLED') continue;
      if (packageId && !pkg?.toLowerCase().includes(packageId.toLowerCase())) continue;

      if (startDate) {
        bookedDates.push({ start: startDate, end: endDate || startDate, package: pkg });
      }
    }
  }

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
      range: 'Sheet1!K:N',
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
