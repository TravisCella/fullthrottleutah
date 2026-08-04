// lib/business.js
// Single source of truth for Full Throttle Utah's physical pickup / business
// address. Imported by the confirmation email (app/api/webhook/route.js) and
// the confirmation SMS (lib/sms.js) so the address is defined exactly once and
// the two channels can never drift. Do NOT hardcode the address inline in a
// template — add/extend it here.

// Formatted to match the official Google Maps listing exactly ("1271 S 650 W,
// Farmington, UT 84025") so the Maps link below resolves to the real listing
// and the confirmation matches what a customer sees when they search.
export const PICKUP_ADDRESS = {
  name: 'Farmington Bay Storage',
  street: '1271 S 650 W',
  city: 'Farmington',
  state: 'UT',
  zip: '84025',
};

// One-line, fully-qualified address string — reused for display and for the
// Google Maps query below so they always match.
export const PICKUP_ADDRESS_ONE_LINE = `${PICKUP_ADDRESS.name}, ${PICKUP_ADDRESS.street}, ${PICKUP_ADDRESS.city}, ${PICKUP_ADDRESS.state} ${PICKUP_ADDRESS.zip}`;

// Google Maps deep link to the pickup address. Uses the officially-documented
// Maps URL format so it resolves on web and in the native app on any device.
export const PICKUP_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  PICKUP_ADDRESS_ONE_LINE
)}`;

// Compact single-line form for SMS: "name, street, city, State zip".
export function formatPickupAddressLine() {
  return PICKUP_ADDRESS_ONE_LINE;
}
