// lib/reschedule-notification.js
// Notifies a renter that their booking date changed. Email always (when we have
// an address + RESEND_API_KEY); SMS only if they opted in. Each channel is
// independently try/caught so a failure in one never blocks the other or the
// caller (the reschedule itself already succeeded before this runs).

import { sendSMS } from './sms';

export async function sendRescheduleNotification(booking) {
  const {
    renterName,
    renterEmail,
    renterPhone,
    smsOptIn,
    packageName,
    location,
    newStart,
    newEnd,
    pickupTimeDisplay,
    bookingId,
  } = booking;

  const firstName = (renterName || '').split(' ')[0] || 'there';
  const dateLine = newEnd && newEnd !== newStart ? `${newStart} → ${newEnd}` : newStart;
  const locLine = location ? ` at ${location}` : '';

  // ─── Email (always, if we have an address) ─────────────────────────────────
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY && renterEmail) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_KEY}`,
        },
        body: JSON.stringify({
          from: 'Full Throttle Utah <bookings@fullthrottleutah.com>',
          to: renterEmail,
          subject: `Your rental has been rescheduled — ${dateLine}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #0C4A6E; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
                <h1 style="color: #fff; margin: 0; font-size: 22px;">Your rental has been rescheduled</h1>
              </div>
              <div style="padding: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
                <p>Hi ${firstName},</p>
                <p>Your reservation has been moved to the new date below. Everything else about your booking stays the same — there's no additional charge.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                  <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">Package</td><td style="padding: 8px; font-weight: 600;">${packageName || ''}</td></tr>
                  <tr style="background:#fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Location</td><td style="padding: 8px; font-weight: 600;">${location || ''}</td></tr>
                  <tr><td style="padding: 8px; color: #64748b; font-size: 13px;">New Date</td><td style="padding: 8px; font-weight: 700; color: #0C4A6E; font-size: 16px;">${dateLine}</td></tr>
                  ${pickupTimeDisplay ? `<tr style="background:#fff;"><td style="padding: 8px; color: #64748b; font-size: 13px;">Pickup Time</td><td style="padding: 8px; font-weight: 600;">${pickupTimeDisplay}</td></tr>` : ''}
                </table>
                <p style="font-size: 13px; color: #64748b;">Questions or need to adjust again? Just reply to this email or call/text us at (801) 548-1273.</p>
                <p style="font-size: 13px; color: #64748b;">See you on the water!</p>
                <p><strong>Full Throttle Utah</strong><br/>TW Assets LLC · Farmington, UT</p>
              </div>
            </div>
          `,
        }),
      });
    } catch (err) {
      console.error('[reschedule] email failed:', err.message);
    }
  }

  // ─── SMS (opted-in renters only) ───────────────────────────────────────────
  if (smsOptIn && renterPhone) {
    try {
      const msg =
        `Full Throttle Utah: your ${packageName || 'rental'}${locLine} has been rescheduled to ` +
        `${dateLine}${pickupTimeDisplay ? `, pickup ${pickupTimeDisplay}` : ''}. ` +
        `No extra charge. Reply here with any questions — see you on the water!`;
      await sendSMS(renterPhone, msg);
    } catch (err) {
      console.error('[reschedule] SMS failed:', err.message);
    }
  }
}
