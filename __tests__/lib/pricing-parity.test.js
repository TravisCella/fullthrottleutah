// __tests__/lib/pricing-parity.test.js
// Proves that computeTotal() from lib/pricing.js produces identical totals
// to the original inline formula in app/booking.js for every test scenario.
//
// "OLD" side: inline functions copied verbatim from booking.js + the booking.js
//             total formula (line 638). Inputs are Date objects, as the UI uses.
// "NEW" side: computeTotal() from lib/pricing.js. Inputs are ISO strings, as
//             the server uses. parseLocalDate() converts them to local Date
//             objects before the same underlying functions run.
//
// A mismatch here means extracton introduced drift — that is the only thing
// being tested. Rate correctness is assumed (constants are verbatim copies).

import { PACKAGES, LOCATIONS, computeTotal } from '../../lib/pricing.js';

// ─── OLD: verbatim inline functions from booking.js ──────────────────────────

const OLD_HOLIDAYS = [
  { start: '07-01', end: '07-05', name: 'July 4th', premium: 75 },
  { start: '07-20', end: '07-25', name: 'Pioneer Day', premium: 75 },
  { start: '08-29', end: '09-02', name: 'Labor Day', premium: 75 },
  { start: '05-23', end: '05-27', name: 'Memorial Day', premium: 75 },
];

function OLD_isWeekend(d) {
  const day = new Date(d).getDay();
  return day === 0 || day === 5 || day === 6;
}
function OLD_daysBetween(a, b) {
  return Math.round((b - a) / 864e5) + 1;
}

function OLD_calculatePrice(pkg, start, end) {
  const days = OLD_daysBetween(start, end);
  if (days === 1) return OLD_isWeekend(start) ? pkg.weekend : pkg.weekday;
  let rate;
  if (days >= 5) rate = pkg.multiDay[5];
  else if (days >= 4) rate = pkg.multiDay[4];
  else if (days >= 3) rate = pkg.multiDay[3];
  else rate = pkg.multiDay[2];
  return rate * days;
}

function OLD_getHolidaySurcharge(startDate, endDate) {
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
    for (const h of OLD_HOLIDAYS) {
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

// Replicates booking.js line 638 exactly:
//   totalPrice = basePrice + holidayInfo.total + whiteGloveFee + deconFee + extraVestFee - loyaltyDiscount
function oldTotal(
  pkg,
  startDate,
  endDate,
  { whiteGlove = false, repeatCustomer = false, loc = null, spareVestCount = 0 } = {}
) {
  const location = loc || LOCATIONS[0]; // default: Pineview (no fees)
  const basePrice = OLD_calculatePrice(pkg, startDate, endDate);
  const holidaySurcharge = OLD_getHolidaySurcharge(startDate, endDate).total;
  const whiteGloveFee = whiteGlove && location?.whiteGloveFee ? location.whiteGloveFee : 0;
  const deconFee = location?.id === 'lake-powell' ? 200 : 0;
  const extraVestFee = spareVestCount * 15;
  const loyaltyDiscount = repeatCustomer ? Math.round(basePrice * 0.1) : 0;
  return basePrice + holidaySurcharge + whiteGloveFee + deconFee + extraVestFee - loyaltyDiscount;
}

// ─── NEW: computeTotal wrapper — converts Date objects to ISO for the server path ──

// toISODate verbatim from booking.js
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function newTotal(
  pkg,
  startDate,
  endDate,
  { whiteGlove = false, repeatCustomer = false, loc = null, vestSizes = {} } = {}
) {
  const location = loc || LOCATIONS[0];
  return computeTotal({
    packageName: pkg.name,
    startDate: toISODate(startDate),
    endDate: toISODate(endDate),
    locationId: location.id,
    whiteGlove,
    vestSizes,
    repeatCustomer,
  }).total;
}

// ─── Package & location shorthands ───────────────────────────────────────────

const SPARK = PACKAGES.find((p) => p.id === 'spark-duo');
const GTX = PACKAGES.find((p) => p.id === 'gtx-duo');
const PINEVIEW = LOCATIONS.find((l) => l.id === 'pineview');
const WILLARD = LOCATIONS.find((l) => l.id === 'willard-bay');
const ECHO = LOCATIONS.find((l) => l.id === 'echo');
const DEER_CREEK = LOCATIONS.find((l) => l.id === 'deer-creek');
const POWELL = LOCATIONS.find((l) => l.id === 'lake-powell');

// ─── 2026 calendar facts (for date construction) ─────────────────────────────
// Jan 1, 2026 = Thursday. Derived from that:
//   May 1  = Friday  (day of week 5)
//   May 22 = Friday  (day of week 5) — weekend per FTU rules
//   May 23 = Saturday                — holiday window start (Memorial Day 05-23→05-27)
//   May 27 = Wednesday               — holiday window end
//   Jun 1  = Monday
//   Jun 6  = Saturday                — weekend, no holiday
//   Jun 9  = Tuesday                 — weekday, no holiday
//   Jul 1  = Wednesday
//   Jul 3  = Friday  (day of week 5) — weekend + holiday window
//   Jul 4  = Saturday                — weekend + holiday
//   Jul 5  = Sunday                  — weekend + holiday (last in range 07-01→07-05)

describe('pricing parity: old booking.js inline === new computeTotal', () => {
  test('1-day weekday (Tue Jun 9), Spark Duo — baseline', () => {
    const d = new Date(2026, 5, 9); // Jun 9 = Tuesday
    const old = oldTotal(SPARK, d, d, { loc: PINEVIEW });
    const neu = newTotal(SPARK, d, d, { loc: PINEVIEW });
    // expected: $299 weekday
    expect(old).toBe(299);
    expect(neu).toBe(old);
  });

  test('1-day Saturday (Jun 6), GTX Limited Duo — weekend rate', () => {
    const d = new Date(2026, 5, 6); // Jun 6 = Saturday
    const old = oldTotal(GTX, d, d, { loc: WILLARD });
    const neu = newTotal(GTX, d, d, { loc: WILLARD });
    // expected: $649 weekend
    expect(old).toBe(649);
    expect(neu).toBe(old);
  });

  test('1-day Friday (May 22), Spark Duo — weekend BOUNDARY (Fri = weekend)', () => {
    const d = new Date(2026, 4, 22); // May 22 = Friday → isWeekend = true
    const old = oldTotal(SPARK, d, d, { loc: PINEVIEW });
    const neu = newTotal(SPARK, d, d, { loc: PINEVIEW });
    // expected: $329 weekend (Friday qualifies)
    expect(old).toBe(329);
    expect(neu).toBe(old);
  });

  test('1-day Tuesday (Jun 9), Spark Duo — NOT a weekend', () => {
    const d = new Date(2026, 5, 9); // Jun 9 = Tuesday → isWeekend = false
    const old = oldTotal(SPARK, d, d, { loc: PINEVIEW });
    const neu = newTotal(SPARK, d, d, { loc: PINEVIEW });
    // expected: $299 weekday
    expect(old).toBe(299);
    expect(neu).toBe(old);
  });

  test('1-day May 23 (Sat, HOLIDAY WINDOW START), Spark Duo — weekend + holiday', () => {
    const d = new Date(2026, 4, 23); // May 23 = Saturday, start of Memorial Day window
    const old = oldTotal(SPARK, d, d, { loc: PINEVIEW });
    const neu = newTotal(SPARK, d, d, { loc: PINEVIEW });
    // expected: $329 weekend + $75 holiday = $404
    expect(old).toBe(404);
    expect(neu).toBe(old);
  });

  test('1-day May 27 (Wed, HOLIDAY WINDOW END), Spark Duo — weekday + holiday', () => {
    const d = new Date(2026, 4, 27); // May 27 = Wednesday, last day of Memorial Day window
    const old = oldTotal(SPARK, d, d, { loc: PINEVIEW });
    const neu = newTotal(SPARK, d, d, { loc: PINEVIEW });
    // expected: $299 weekday + $75 holiday = $374
    expect(old).toBe(374);
    expect(neu).toBe(old);
  });

  test('1-day Jul 3 (Fri, holiday window mid), GTX — weekend + holiday BOUNDARY', () => {
    const d = new Date(2026, 6, 3); // Jul 3 = Friday → weekend + in 07-01→07-05
    const old = oldTotal(GTX, d, d, { loc: PINEVIEW });
    const neu = newTotal(GTX, d, d, { loc: PINEVIEW });
    // expected: $649 weekend + $75 holiday = $724
    expect(old).toBe(724);
    expect(neu).toBe(old);
  });

  test('3-day weekday (Jun 9-11), Spark Duo — multi-day tier', () => {
    const start = new Date(2026, 5, 9); // Tue
    const end = new Date(2026, 5, 11); // Thu
    const old = oldTotal(SPARK, start, end, { loc: ECHO });
    const neu = newTotal(SPARK, start, end, { loc: ECHO });
    // expected: $267/day × 3 = $801 (multi-day ignores weekday/weekend)
    expect(old).toBe(801);
    expect(neu).toBe(old);
  });

  test('2-day Jul 4-5 (Sat-Sun), Spark Duo — multi-day + holiday surcharge', () => {
    const start = new Date(2026, 6, 4); // Sat Jul 4
    const end = new Date(2026, 6, 5); // Sun Jul 5
    const old = oldTotal(SPARK, start, end, { loc: PINEVIEW });
    const neu = newTotal(SPARK, start, end, { loc: PINEVIEW });
    // expected: $286/day × 2 = $572 base + ($75 + $75) holiday = $722
    expect(old).toBe(722);
    expect(neu).toBe(old);
  });

  test('1-day weekday, Spark, Deer Creek + white glove', () => {
    const d = new Date(2026, 5, 9); // Tue
    const old = oldTotal(SPARK, d, d, { loc: DEER_CREEK, whiteGlove: true });
    const neu = newTotal(SPARK, d, d, { loc: DEER_CREEK, whiteGlove: true });
    // expected: $299 + $250 white glove = $549
    expect(old).toBe(549);
    expect(neu).toBe(old);
  });

  test('3-day weekday, GTX, Lake Powell — decon fee, no white glove', () => {
    const start = new Date(2026, 5, 9);
    const end = new Date(2026, 5, 11);
    const old = oldTotal(GTX, start, end, { loc: POWELL });
    const neu = newTotal(GTX, start, end, { loc: POWELL });
    // expected: $483/day × 3 = $1449 + $200 decon = $1649
    expect(old).toBe(1649);
    expect(neu).toBe(old);
  });

  test('1-day weekday, Spark, Pineview — loyalty discount (Math.round of 10%)', () => {
    const d = new Date(2026, 5, 9); // Tue, $299 base
    const old = oldTotal(SPARK, d, d, { loc: PINEVIEW, repeatCustomer: true });
    const neu = newTotal(SPARK, d, d, { loc: PINEVIEW, repeatCustomer: true });
    // expected: $299 base; Math.round(299 * 0.10) = Math.round(29.9) = 30; total = $269
    expect(old).toBe(269);
    expect(neu).toBe(old);
  });

  test('1-day weekday, GTX, Pineview — 2 spare vests (8 total, capacity 6)', () => {
    const d = new Date(2026, 5, 9); // Tue
    const spareVestCount = 2;
    const vestSizes = { adult_medium: 8 }; // 8 total vests, 6 capacity → 2 spares
    const old = oldTotal(GTX, d, d, { loc: PINEVIEW, spareVestCount });
    const neu = newTotal(GTX, d, d, { loc: PINEVIEW, vestSizes });
    // expected: $549 + (2 × $15) spare fee = $579
    expect(old).toBe(579);
    expect(neu).toBe(old);
  });

  test('5-day, GTX, Sand Hollow + white glove — max multi-day tier', () => {
    const start = new Date(2026, 5, 9);
    const end = new Date(2026, 5, 13); // 5 days
    const OLD_SAND = LOCATIONS.find((l) => l.id === 'sand-hollow');
    const old = oldTotal(GTX, start, end, { loc: OLD_SAND, whiteGlove: true });
    const neu = newTotal(GTX, start, end, { loc: OLD_SAND, whiteGlove: true });
    // expected: $439/day × 5 = $2195 + $750 white glove = $2945
    expect(old).toBe(2945);
    expect(neu).toBe(old);
  });

  test('location lookup by display name (deploy-window fallback)', () => {
    // Simulates a client bundle that sends location name, not locationId
    const d = new Date(2026, 5, 9);
    const byId = computeTotal({
      packageName: 'Spark Duo',
      startDate: '2026-06-09',
      endDate: '2026-06-09',
      locationId: 'pineview',
      whiteGlove: false,
      vestSizes: {},
      repeatCustomer: false,
    });
    const byName = computeTotal({
      packageName: 'Spark Duo',
      startDate: '2026-06-09',
      endDate: '2026-06-09',
      location: 'Pineview Reservoir',
      whiteGlove: false,
      vestSizes: {},
      repeatCustomer: false,
    });
    expect(byId.total).toBe(byName.total);
  });
});
