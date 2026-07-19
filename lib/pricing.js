// lib/pricing.js
// Single source of truth for all rental pricing constants and computations.
// Imported by app/booking.js (UI display) and app/api/checkout/route.js
// (authoritative server charge). Pure JS — no API calls, no side effects,
// safe for both 'use client' and server-only contexts.
//
// PACKAGES, LOCATIONS, HOLIDAYS, and fee constants are verbatim copies from
// app/booking.js. When changing any rate or fee, change it here only.

// ─── Packages ────────────────────────────────────────────────────────────────

export const PACKAGES = [
  {
    id: 'trixx-single',
    name: 'Sea-Doo Spark Trixx (3UP)',
    tagline: '1 × 2018 Sea-Doo Spark Trixx 3-Up (90 HP)',
    description:
      'A single, playful Trixx built for fun — extended hull for tow sports (wakeboard, tube, ski) and seating for up to 3. The low-commitment way to get one machine on the water without renting a pair.',
    includes: [
      '1 Sea-Doo Spark Trixx (3-up)',
      'Single trailer',
      '3 life preservers',
      '1 anchoring system',
      'Safety flags',
    ],
    weekday: 239,
    weekend: 275,
    multiDay: { 2: 215, 3: 203, 4: 191, 5: 179 },
    deposit: 750,
    maxRiders: 3, // single 3-up ski
    heroImg: 'trixxHero',
    galleryImgs: ['trixxFront', 'trixxSide', 'trixxAction'],
    accent: '#7C3AED',
    accentLight: 'rgba(124,58,237,0.08)',
  },
  {
    id: 'spark-duo',
    name: 'Spark Duo',
    tagline: '2 × 2014 Sea-Doo Spark 900 ACE HO',
    description:
      'Two nimble, lightweight Sparks on a single trailer. Quick, fun, and easy to ride — perfect for cruising any Utah reservoir.',
    includes: [
      '2 Sea-Doo Spark 900 ACE HO',
      'Single trailer',
      '4 life preservers',
      '2 anchoring systems',
      'Safety flags',
    ],
    weekday: 299,
    weekend: 335,
    multiDay: { 2: 286, 3: 267, 4: 259, 5: 245 },
    deposit: 1000,
    maxRiders: 4, // 2 skis × 2 riders each
    heroImg: 'sparkHero',
    galleryImgs: ['sparkFront', 'sparkSide', 'sparkAngle'],
    accent: '#0EA5E9',
    accentLight: 'rgba(14,165,233,0.08)',
  },
  {
    id: 'gtx-duo',
    name: 'GTX Limited Duo',
    tagline: '2 × 2026 Sea-Doo GTX Limited 325',
    description:
      'The ultimate luxury ride. 325 HP, 10.25" touchscreen, premium Bluetooth audio, massive swim platform. This is first class on the water.',
    includes: [
      '2 Sea-Doo GTX Limited 325 HP',
      'Single trailer',
      '6 life preservers',
      '2 anchoring systems',
      'Safety flags',
      'Bluetooth audio',
    ],
    weekday: 549,
    weekend: 649,
    multiDay: { 2: 522, 3: 483, 4: 467, 5: 439 },
    deposit: 2000,
    maxRiders: 6, // 2 skis × 3 riders each (Sea-Doo GTX 325 is 3-up)
    heroImg: 'gtxHero',
    galleryImgs: ['gtxStudio', 'gtxWater', 'gtxAction'],
    accent: '#B8860B',
    accentLight: 'rgba(184,134,11,0.08)',
  },
];

// ─── Locations ────────────────────────────────────────────────────────────────

export const LOCATIONS = [
  {
    id: 'pineview',
    name: 'Pineview Reservoir',
    region: 'Ogden Valley',
    drive: '~1hr',
    emoji: '🏔️',
    aisStatus: 'clean',
    whiteGloveFee: 175,
    // 2026 drawdown advisory — Pineview is being drained to ~1.7% capacity for a
    // pipeline replacement; launch access is limited and may end entirely.
    advisory: {
      title: 'Limited access — Pineview is being drawn down',
      body: 'Pineview is being drained for a major pipeline project. The Port Ramp Marina is closed and the remaining ramps (Cemetery Point, Anderson Cove) are congested with limited space — some renters have been turned away, and ramps may close as early as August. Launch access is not guaranteed and the reservoir may become unboatable. We strongly recommend choosing another lake, or call/text us at (801) 548-1273 to confirm current conditions before booking Pineview.',
    },
  },
  {
    id: 'willard-bay',
    name: 'Willard Bay',
    region: 'Northern Utah',
    drive: '~35min',
    emoji: '🦅',
    aisStatus: 'clean',
    whiteGloveFee: 150,
  },
  {
    id: 'echo',
    name: 'Echo Reservoir',
    region: 'Summit County',
    drive: '~45min',
    emoji: '🌊',
    aisStatus: 'clean',
    whiteGloveFee: 175,
  },
  {
    id: 'rockport',
    name: 'Rockport Reservoir',
    region: 'Summit County',
    drive: '~50min',
    emoji: '🪨',
    aisStatus: 'clean',
    whiteGloveFee: 225,
  },
  {
    id: 'east-canyon',
    name: 'East Canyon Reservoir',
    region: 'Morgan County',
    drive: '~50min',
    emoji: '🏞️',
    aisStatus: 'clean',
    whiteGloveFee: 200,
  },
  {
    id: 'jordanelle',
    name: 'Jordanelle Reservoir',
    region: 'Wasatch Back',
    drive: '~45min',
    emoji: '🌲',
    aisStatus: 'clean',
    whiteGloveFee: 225,
  },
  {
    id: 'deer-creek',
    name: 'Deer Creek Reservoir',
    region: 'Heber Valley',
    drive: '~50min',
    emoji: '🦌',
    aisStatus: 'clean',
    whiteGloveFee: 250,
  },
  {
    id: 'utah-lake',
    name: 'Utah Lake',
    region: 'Utah County',
    drive: '~1hr',
    emoji: '🐟',
    aisStatus: 'clean',
    whiteGloveFee: 250,
  },
  {
    id: 'yuba',
    name: 'Yuba Lake',
    region: 'Central Utah',
    drive: '~2hr',
    emoji: '🏖️',
    aisStatus: 'clean',
    whiteGloveFee: 400,
  },
  {
    id: 'bear-lake',
    name: 'Bear Lake',
    region: 'Utah/Idaho Border',
    drive: '~2.5hr',
    emoji: '💎',
    aisStatus: 'clean',
    minDays: 2,
    whiteGloveFee: 450,
  },
  {
    id: 'flaming-gorge',
    name: 'Flaming Gorge Reservoir',
    region: 'Utah/Wyoming Border',
    drive: '~3.5hr',
    emoji: '🔥',
    aisStatus: 'clean',
    minDays: 3,
    whiteGloveFee: 650,
  },
  {
    id: 'sand-hollow',
    name: 'Sand Hollow Reservoir',
    region: 'St. George / Hurricane',
    drive: '~4hr',
    emoji: '🌅',
    aisStatus: 'clean',
    minDays: 3,
    whiteGloveFee: 750,
  },
  {
    id: 'lake-powell',
    name: 'Lake Powell',
    region: 'Southern Utah',
    drive: '~4.5hr',
    emoji: '🏜️',
    aisStatus: 'infested',
    minDays: 3,
    deconFee: 200,
    whiteGloveFee: null,
  },
];

// ─── Holidays ─────────────────────────────────────────────────────────────────

// Holiday surcharge removed 2026-07-18 (all machines). Empty array = no holiday
// premium anywhere: getHolidaySurcharge() returns 0 and the calendar shows no
// holiday badge/premium. Re-add entries here to bring the surcharge back.
export const HOLIDAYS = [];

// ─── Fee constants ────────────────────────────────────────────────────────────

export const EXTRA_VEST_FEE = 15; // $ per spare vest beyond rated boat capacity
export const MAX_EXTRA_VESTS = 2; // hard cap on spares — server enforces this too
export const LOYALTY_DISCOUNT_RATE = 0.1; // 10% off base price for returning customers

// ─── Lookups ──────────────────────────────────────────────────────────────────

export function getPackage(name) {
  return PACKAGES.find((p) => p.name === name) || null;
}

// Accepts either the id string (e.g. "pineview") or the full display name
// (e.g. "Pineview Reservoir") — supports the deploy-window period where older
// client bundles may not yet send locationId.
export function getLocation(idOrName) {
  return LOCATIONS.find((l) => l.id === idOrName || l.name === idOrName) || null;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Parses an ISO date string as a LOCAL-time midnight Date, matching the
// calendar's `new Date(year, month, day)` pattern. Never use new Date("YYYY-MM-DD")
// directly — that parses as UTC midnight, which shifts the date in US/Mountain.
function parseLocalDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Verbatim from booking.js — accepts a Date object.
export function isWeekend(d) {
  const day = new Date(d).getDay();
  return day === 0 || day === 5 || day === 6;
}

// Verbatim from booking.js — accepts two Date objects.
export function daysBetween(a, b) {
  return Math.round((b - a) / 864e5) + 1;
}

// ─── Premiums-tab adjustment ─────────────────────────────────────────────────
// Applies overlapping rows from the Premiums tab to the base price.
// premiums: array returned by getPremiumDates() in lib/sheets.js
// start, end: Date objects (local midnight, same construction as calculateBasePrice)
// basePrice: number — used to prorate percentage adjustments
// Returns { adjustment (negative = discount, positive = surcharge), reason }
export function computePremiumAdjustment(premiums, start, end, basePrice) {
  if (!premiums || premiums.length === 0) return { adjustment: 0, reason: '' };

  const totalDays = daysBetween(start, end);
  let adjustment = 0;
  let reason = '';

  for (const p of premiums) {
    const pStart = parseLocalDate(p.start);
    const pEnd = parseLocalDate(p.end || p.start);

    if (pStart > end || pEnd < start) continue; // no overlap

    const overlapStart = pStart > start ? pStart : start;
    const overlapEnd = pEnd < end ? pEnd : end;
    const overlapDays = daysBetween(overlapStart, overlapEnd);

    if (p.flatAdd !== 0) {
      adjustment += p.flatAdd * overlapDays;
    } else if (p.multiplier !== 1) {
      // Percentage: prorate base price over the overlapping days
      const dailyBase = basePrice / totalDays;
      adjustment += dailyBase * (p.multiplier - 1) * overlapDays;
    }

    if (p.reason) reason = p.reason;
  }

  return { adjustment: Math.round(adjustment), reason };
}

// ─── Core pricing functions ───────────────────────────────────────────────────

// Renamed from calculatePrice in booking.js; logic is verbatim.
// Accepts Date objects for start/end, same as the original.
export function calculateBasePrice(pkg, start, end) {
  const days = daysBetween(start, end);
  if (days === 1) return isWeekend(start) ? pkg.weekend : pkg.weekday;
  let rate;
  if (days >= 5) rate = pkg.multiDay[5];
  else if (days >= 4) rate = pkg.multiDay[4];
  else if (days >= 3) rate = pkg.multiDay[3];
  else rate = pkg.multiDay[2];
  return rate * days;
}

// Verbatim from booking.js — accepts Date objects for startDate/endDate.
export function getHolidaySurcharge(startDate, endDate) {
  if (!startDate) return { total: 0, holidays: [] };
  const end = endDate || startDate;
  const matched = [];
  let totalSurcharge = 0;

  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  while (current <= last) {
    const mmdd = `${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
    for (const h of HOLIDAYS) {
      if (mmdd >= h.start && mmdd <= h.end) {
        if (!matched.find((m) => m.name === h.name)) {
          matched.push(h);
        }
        totalSurcharge += h.premium;
        break;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return { total: totalSurcharge, holidays: matched };
}

// ─── Authoritative total (server path) ───────────────────────────────────────
// Accepts only tamper-resistant primitives. Dollar amounts are never read from
// the client — the server computes the charge from first principles here.
//
// input:
//   packageName    — "Spark Duo" | "GTX Limited Duo"
//   startDate      — ISO "YYYY-MM-DD"
//   endDate        — ISO "YYYY-MM-DD"
//   locationId     — preferred (e.g. "pineview"); falls back to location name
//   location       — display-name fallback for deploy-window clients
//   whiteGlove     — boolean
//   vestSizes      — { [sizeKey]: count } parsed by server from POST body
//   repeatCustomer — boolean determined by SERVER via isRepeatCustomer(); never trusted from client
//
// returns: { basePrice, holidaySurcharge, whiteGloveFee, deconFee,
//            spareVestCount, extraVestFee, loyaltyDiscount, days, total }
export function computeTotal({
  packageName,
  startDate,
  endDate,
  locationId,
  location,
  whiteGlove,
  vestSizes,
  repeatCustomer,
  premiums = [],
}) {
  const pkg = getPackage(packageName);
  if (!pkg) throw new Error(`[pricing] Unknown package: ${packageName}`);

  const loc = getLocation(locationId || location);
  if (!loc) throw new Error(`[pricing] Unknown location: ${locationId || location}`);

  // Parse ISO strings to local Date objects so pricing functions behave
  // identically to the booking UI (new Date(year, month, day) construction).
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate || startDate);

  const basePrice = calculateBasePrice(pkg, start, end);
  const holidaySurcharge = getHolidaySurcharge(start, end).total;
  const whiteGloveFee = whiteGlove && loc.whiteGloveFee ? loc.whiteGloveFee : 0;
  const deconFee = loc.deconFee || 0;

  const totalVests = Object.values(vestSizes || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const spareVestCount = Math.max(0, totalVests - pkg.maxRiders);
  const extraVestFee = spareVestCount * EXTRA_VEST_FEE;

  const loyaltyDiscount = repeatCustomer ? Math.round(basePrice * LOYALTY_DISCOUNT_RATE) : 0;

  const { adjustment: premiumAdjustment, reason: promoReason } = computePremiumAdjustment(
    premiums,
    start,
    end,
    basePrice
  );

  const total = Math.max(
    0,
    basePrice +
      holidaySurcharge +
      whiteGloveFee +
      deconFee +
      extraVestFee -
      loyaltyDiscount +
      premiumAdjustment
  );

  return {
    basePrice,
    holidaySurcharge,
    whiteGloveFee,
    deconFee,
    spareVestCount,
    extraVestFee,
    loyaltyDiscount,
    premiumAdjustment,
    promoReason,
    days: daysBetween(start, end),
    total,
  };
}
