// lib/reset-booking.js
// Pure utility for resetting a booking's lifecycle metadata back to the
// clean pre-pickup state. No Stripe calls, no side effects — just metadata
// transforms. Imported by update-booking/route.js and usable anywhere else
// that needs to revert a booking.

export const RESET_FIELDS = [
  'rentalStatus',
  'securityDepositStatus',
  'securityDepositHoldId',
  'securityDepositMethod',
  'securityDepositCard',
  'pickupTimestamp',
  'returnTimestamp',
  'capturedAmount',
  'damageReason',
  'captureTimestamp',
  'returnNotes',
  'cashDepositAmount',
  'externalStripeAction',
  'externalStripeActionAt',
];

// Returns a new metadata object with all lifecycle fields cleared and
// status fields set to their canonical initial values.
// Stripe treats '' as a delete on metadata keys.
export function buildResetMetadata(currentMeta) {
  const updates = { ...(currentMeta || {}) };
  for (const field of RESET_FIELDS) {
    updates[field] = '';
  }
  updates.rentalStatus = 'booked';
  updates.securityDepositStatus = 'pending';
  return updates;
}

// Returns { field: { before, after } } for every lifecycle field that had
// a non-empty value before the reset. Always includes the two status fields
// for auditability regardless of their prior value.
export function diffResetMetadata(before, after) {
  const changed = {};
  for (const field of RESET_FIELDS) {
    if ((before?.[field] ?? '') !== '') {
      changed[field] = { before: before[field], after: after[field] };
    }
  }
  changed.rentalStatus = {
    before: before?.rentalStatus || '(unset)',
    after: after.rentalStatus,
  };
  changed.securityDepositStatus = {
    before: before?.securityDepositStatus || '(unset)',
    after: after.securityDepositStatus,
  };
  return changed;
}
