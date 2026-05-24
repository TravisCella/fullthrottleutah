import Stripe from 'stripe';
import { google } from 'googleapis';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Get all bookings from Google Sheets, returns map keyed by booking_id (Stripe session id)
async function getAllBookingsFromSheet() {
  try {
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

    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: 'Sheet1!A:N',
    });

    const rows = res.data.values || [];
    const bookingsMap = {};

    if (rows.length > 1) {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const bookingId = row[0]; // column A = booking_id (Stripe session id)
        if (!bookingId) continue;

        bookingsMap[bookingId] = {
          booking_id: bookingId,
          date_booked: row[1] || '',
          package: row[2] || '',
          location: row[3] || '',
          start_date: row[4] || '',
          end_date: row[5] || '',
          days: row[6] || '',
          total_price: row[7] || '',
          deposit_paid: row[8] || '',
          renter_name: row[9] || '',
          renter_email: row[10] || '',
          renter_phone: row[11] || '',
          experience: row[12] || '',
          status: row[13] || 'CONFIRMED',
        };
      }
    }

    return bookingsMap;
  } catch (err) {
    console.error('Sheet read error (non-fatal):', err.message);
    return {};
  }
}

export async function POST(request) {
  try {
    const { password } = await request.json();
    
    if (password !== process.env.ADMIN_PASSWORD) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Pull from both sources in parallel
    const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);
    
    const [sessionsResponse, sheetBookings] = await Promise.all([
      stripe.checkout.sessions.list({
        created: { gte: ninetyDaysAgo },
        limit: 100,
        expand: ['data.payment_intent', 'data.customer'],
      }),
      getAllBookingsFromSheet(),
    ]);

    const bookings = sessionsResponse.data
      .filter(s => s.payment_status === 'paid')
      .map(s => {
        const pi = s.payment_intent || {};
        const meta = pi.metadata || {};
        const customer = s.customer || {};
        const sheetData = sheetBookings[s.id] || {};
        
        // Prefer sheet data for renter info (more reliable for older bookings)
        // Fall back to Stripe metadata, then customer object
        const renterName = sheetData.renter_name || meta.renterName || customer.name || '';
        const renterEmail = sheetData.renter_email || meta.renterEmail || customer.email || '';
        const renterPhone = sheetData.renter_phone || meta.renterPhone || '';
        const packageName = sheetData.package || meta.packageName || '';
        const location = sheetData.location || meta.location || '';
        const startDate = sheetData.start_date || meta.startDate || '';
        const endDate = sheetData.end_date || meta.endDate || startDate;
        const days = sheetData.days || meta.days || '1';
        const experience = sheetData.experience || meta.experience || '';
        const totalPrice = sheetData.total_price || (s.amount_total / 100).toString();
        
        // Detect "test bookings" — created by you with your own email/card
        // A test booking has no renter name from sheet AND payment amount is small
        // (or matches your test pattern)
        const ownerEmail = process.env.OWNER_EMAIL || '';
        const isTestBooking = ownerEmail && renterEmail.toLowerCase() === ownerEmail.toLowerCase();
        
        // Determine display name
        const displayName = renterName || 'Unknown Customer';
        
        return {
          sessionId: s.id,
          paymentIntentId: pi.id || null,
          customerId: typeof customer === 'string' ? customer : customer.id,
          
          renterName: displayName,
          renterEmail,
          renterPhone,
          
          packageName,
          location,
          startDate,
          endDate,
          days: parseInt(days, 10) || 1,
          experience,
          
          totalPaid: s.amount_total / 100,
          totalPrice: parseFloat(totalPrice) || (s.amount_total / 100),
          rentalStatus: meta.rentalStatus || 'booked',
          securityDepositStatus: meta.securityDepositStatus || 'pending',
          securityDepositMethod: meta.securityDepositMethod || '',
          securityDepositHoldId: meta.securityDepositHoldId || null,
          
          whiteGlove: sheetData.location ? (meta.whiteGlove === 'true') : (meta.whiteGlove === 'true'),
          isLakePowell: location?.toLowerCase().includes('powell') || meta.isLakePowell === 'true',
          waiverSigned: meta.waiverSigned === 'true' || sheetData.status === 'CONFIRMED',
          waiverDate: meta.waiverDate || '',
          
          isTestBooking,
          inSheet: !!sheetData.booking_id,
          
          createdAt: new Date(s.created * 1000).toISOString(),
          pickupTimestamp: meta.pickupTimestamp || null,
          returnTimestamp: meta.returnTimestamp || null,
        };
      });

    // Sort by start date (upcoming first, with COMPLETED at bottom)
    bookings.sort((a, b) => {
      // Completed rentals go to the bottom
      if (a.rentalStatus === 'completed' && b.rentalStatus !== 'completed') return 1;
      if (b.rentalStatus === 'completed' && a.rentalStatus !== 'completed') return -1;
      
      // Then by start date (parse YYYY-MM-DD)
      const parseDate = (d) => {
        if (!d) return new Date(0);
        // Handle YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          const [y, m, day] = d.split('-').map(Number);
          return new Date(y, m - 1, day);
        }
        return new Date(d);
      };
      
      const aDate = parseDate(a.startDate);
      const bDate = parseDate(b.startDate);
      return aDate - bDate;
    });

    return Response.json({ bookings });
  } catch (err) {
    console.error('List bookings error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
