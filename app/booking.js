'use client';
// app/booking.js
// Version: 2026-06-06 Phase 2 — Rental Agreement step added (Step 5)
// Last edited: June 6 2026
// Feature: Inserts a new "Rental Agreement" step between the existing Waiver
//          step and the Review/Pay step. Booking flow goes from 6 steps to
//          7. The agreement is rendered as a single scrollable document with
//          scroll-gated acknowledgment checkboxes — customer must scroll past
//          the end-of-document marker before any checkbox activates, then
//          checks all 5 boxes from the legal Signature block, then signs
//          via canvas (separate from the waiver signature, capturing distinct
//          consent for evidence quality). All checkpoints are passed to
//          Stripe metadata via /api/checkout, written to Sheet columns V + W
//          via the webhook.
//
//          Content is sourced from lib/agreement-text.js so the same text
//          appears in the booking flow, the webhook customer email, and the
//          future /agreement/[bookingId] page in Phase 3.
//
// Builds on: 2026-06-06 spare vest fee

import { useState, useEffect, useRef } from "react";
import {
  AGREEMENT_VERSION,
  AGREEMENT_PREAMBLE,
  AGREEMENT_SECTIONS,
  AGREEMENT_CHECKBOXES,
} from "../lib/agreement-text";
import {
  PACKAGES, LOCATIONS, HOLIDAYS,
  EXTRA_VEST_FEE, MAX_EXTRA_VESTS,
  isWeekend, daysBetween,
  calculateBasePrice, getHolidaySurcharge, computePremiumAdjustment,
} from "../lib/pricing";

// ── Product images (served from /images/) ──
const IMAGES = {
  gtxStudio: "/images/gtx-studio.jpg",
  gtxWater: "/images/gtx-water.jpg",
  gtxAction: "/images/gtx-action.jpg",
  sparkHero: "/images/spark-hero.png",
  sparkFront: "/images/spark-front.png",
  sparkSide: "/images/spark-side.png",
  sparkAngle: "/images/spark-angle.png",
  sparkOverhead: "/images/spark-overhead.png",
  sparkProfile: "/images/spark-profile.png",
  gtxHero: "/images/gtx-hero.png",
  // Sea-Doo Spark Trixx (3UP) — drop these files into /public/images/
  trixxHero: "/images/trixx-hero.png",
  trixxFront: "/images/trixx-front.png",
  trixxSide: "/images/trixx-side.png",
  trixxAction: "/images/trixx-action.png",
};

// ── Life vest sizes (matches inventory) ──
// Order from largest to smallest for natural reading
const VEST_SIZES = [
  { key: "adult_xxl",       label: "Adult XX-Large",   hint: "90+ lbs" },
  { key: "adult_l_xl",      label: "Adult L/XL",       hint: "" },
  { key: "adult_universal", label: "Adult Universal",  hint: "90+ lbs" },
  { key: "adult_medium",    label: "Adult Medium",     hint: "" },
  { key: "adult_small",     label: "Adult Small",      hint: "" },
  { key: "xs_s",            label: "X-Small / Small",  hint: "" },
  { key: "youth",           label: "Youth",            hint: "50–90 lbs · kids" },
  { key: "infant",          label: "Infant",           hint: "under 30 lbs" },
];

// Shorter labels for SMS/email/sheet output
const SIZE_SHORT = {
  adult_xxl:       "Adult XXL",
  adult_l_xl:      "Adult L/XL",
  adult_universal: "Adult Universal",
  adult_medium:    "Adult M",
  adult_small:     "Adult S",
  xs_s:            "XS/S",
  youth:           "Youth",
  infant:          "Infant",
};

const EMPTY_VESTS = {
  adult_xxl: 0,
  adult_l_xl: 0,
  adult_universal: 0,
  adult_medium: 0,
  adult_small: 0,
  xs_s: 0,
  youth: 0,
  infant: 0,
};

// Default selection if customer skips this section: 2 Adult Mediums (one per operator)
const DEFAULT_VESTS = { ...EMPTY_VESTS, adult_medium: 2 };

// Build the readable summary string used in SMS, email, and Sheet.
// e.g. "1 Adult XXL, 1 Adult M, 1 Youth (3 vests)"  — under capacity
// e.g. "3 Adult M, 2 Adult S (5 vests, 1 spare)"   — over capacity by 1
//
// `maxRiders` is the boat's USCG rider capacity; vests beyond that are spares.
function formatVestSummary(sizes, maxRiders) {
  const parts = [];
  let total = 0;
  for (const [key, count] of Object.entries(sizes)) {
    if (count > 0) {
      parts.push(`${count} ${SIZE_SHORT[key]}`);
      total += count;
    }
  }
  if (parts.length === 0) return "";
  const cap = typeof maxRiders === "number" ? maxRiders : total;
  const spareCount = Math.max(0, total - cap);
  const detail = spareCount > 0
    ? `${total} vest${total === 1 ? "" : "s"}, ${spareCount} spare`
    : `${total} vest${total === 1 ? "" : "s"}`;
  return `${parts.join(", ")} (${detail})`;
}

// ── Pickup & return time slots (2026-06-02 PM) ──
// Internal format: 24-hour "HH:MM" strings. Display format: 12-hour with AM/PM.
function buildTimeSlots(startHour, endHour) {
  const slots = [];
  for (let h = startHour; h <= endHour; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
    if (h < endHour) slots.push(`${String(h).padStart(2, "0")}:30`);
  }
  return slots;
}
// Pickup: 6:00 AM through 6:00 PM (when Travis can hand off equipment)
const PICKUP_SLOTS = buildTimeSlots(6, 18);
// Return: 6:00 AM through 8:00 PM (when Travis can receive equipment back)
const RETURN_SLOTS = buildTimeSlots(6, 20);

function formatTime12h(t24) {
  if (!t24 || !t24.includes(":")) return t24 || "";
  const [hStr, mStr] = t24.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${period}`;
}

function timeToMinutes(t24) {
  if (!t24 || !t24.includes(":")) return 0;
  const [h, m] = t24.split(":").map(Number);
  return h * 60 + m;
}

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }
function formatDate(d) { return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_HDR = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function ImageGallery({ images: imgKeys }) {
  const [active, setActive] = useState(0);
  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#0B1120" }}>
      <img
        src={IMAGES[imgKeys[active]]}
        alt=""
        style={{ width: "100%", height: 220, objectFit: "contain", display: "block", transition: "opacity 0.3s" }}
      />
      {imgKeys.length > 1 && (
        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6 }}>
          {imgKeys.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setActive(i); }}
              style={{
                width: i === active ? 24 : 8,
                height: 8,
                borderRadius: 4,
                border: "none",
                background: i === active ? "#fff" : "rgba(255,255,255,0.4)",
                cursor: "pointer",
                transition: "all 0.2s",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Calendar({ selectedDates, onSelectDate, month, year, onChangeMonth, bookedDates, pkg, premiumDates = [] }) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date(); today.setHours(0,0,0,0);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isBooked = (day) => {
    if (!day || !bookedDates?.length) return false;
    const date = new Date(year, month, day);
    date.setHours(0,0,0,0);
    return bookedDates.some(b => {
      if (!b.start) return false;
      const [sy, sm, sd] = b.start.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd);
      const endStr = b.end || b.start;
      const [ey, em, ed] = endStr.split('-').map(Number);
      const end = new Date(ey, em - 1, ed);
      return date >= start && date <= end;
    });
  };

  const isSelected = (day) => {
    if (!day || selectedDates.length === 0) return false;
    const date = new Date(year, month, day);
    if (selectedDates.length === 1) return date.getTime() === selectedDates[0].getTime();
    return date >= selectedDates[0] && date <= selectedDates[1];
  };
  const isStart = (day) => day && selectedDates.length > 0 && new Date(year, month, day).getTime() === selectedDates[0].getTime();
  const isEnd = (day) => day && selectedDates.length === 2 && new Date(year, month, day).getTime() === selectedDates[1].getTime();
  const isPast = (day) => day && new Date(year, month, day) < today;

  const isHoliday = (day) => {
    if (!day) return false;
    const mmdd = `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return HOLIDAYS.some(h => mmdd >= h.start && mmdd <= h.end);
  };

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button onClick={() => onChangeMonth(-1)} style={navBtn}>{"‹"}</button>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {MONTHS[month]} {year}
        </span>
        <button onClick={() => onChangeMonth(1)} style={navBtn}>{"›"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
        {DAYS_HDR.map(d => (
          <div key={d} style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", padding: "6px 0", letterSpacing: "0.1em", textTransform: "uppercase" }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          const past = isPast(day);
          const sel = isSelected(day);
          const start = isStart(day);
          const end = isEnd(day);
          const wknd = day ? isWeekend(new Date(year, month, day)) : false;
          const booked = isBooked(day);
          const holiday = isHoliday(day);
          const unavailable = past || booked;

          let dayPrice = null;
          if (day && pkg && !past) {
            const baseRate = wknd ? pkg.weekend : pkg.weekday;
            const mmdd = `${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const holidayMatch = HOLIDAYS.find(h => mmdd >= h.start && mmdd <= h.end);
            let premiumAdj = 0;
            if (premiumDates.length > 0) {
              const thisDay = new Date(year, month, day);
              for (const p of premiumDates) {
                const [py, pm, pd] = p.start.split('-').map(Number);
                const pStart = new Date(py, pm - 1, pd);
                const [ey, em, ed] = (p.end || p.start).split('-').map(Number);
                const pEnd = new Date(ey, em - 1, ed);
                if (thisDay >= pStart && thisDay <= pEnd) {
                  if (p.flatAdd !== 0) premiumAdj += p.flatAdd;
                  else if (p.multiplier !== 1) premiumAdj += Math.round(baseRate * (p.multiplier - 1));
                }
              }
            }
            dayPrice = Math.max(0, baseRate + (holidayMatch ? holidayMatch.premium : 0) + premiumAdj);
          }

          const priceColor = !day ? "transparent"
            : booked ? "#EF4444"
            : sel ? "#fff"
            : holiday ? "#DC2626"
            : wknd ? "#D97706"
            : "#94A3B8";

          return (
            <div key={i} onClick={() => day && !unavailable && onSelectDate(new Date(year, month, day))}
              style={{
                padding: "8px 0 6px", fontSize: 13, fontWeight: sel ? 700 : 400,
                cursor: day && !unavailable ? "pointer" : "default",
                color: !day ? "transparent" : booked ? "#EF4444" : past ? "#D1D5DB" : sel ? "#fff" : holiday ? "#DC2626" : wknd ? "#D97706" : "#1E293B",
                background: sel ? (start || end ? "#0C4A6E" : "rgba(12,74,110,0.12)") : booked ? "rgba(239,68,68,0.06)" : holiday && !past ? "rgba(220,38,38,0.06)" : "transparent",
                borderRadius: start && end ? 8 : start ? "8px 0 0 8px" : end ? "0 8px 8px 0" : sel ? 0 : 8,
                transition: "all 0.15s",
                textDecoration: booked ? "line-through" : "none",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
              }}>
              <div>{day || ""}</div>
              {dayPrice && !booked && (
                <div style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: priceColor,
                  marginTop: 1,
                  letterSpacing: "-0.02em",
                  textDecoration: "none",
                }}>${dayPrice}</div>
              )}
              {holiday && day && !past && !booked && (
                <div style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: "#DC2626" }} />
              )}
            </div>
          );
        })}
      </div>
      {pkg && (
        <div style={{ marginTop: 10, padding: "8px 10px", background: "#F8FAFC", borderRadius: 8, fontSize: 10, color: "#64748B", textAlign: "center", lineHeight: 1.5 }}>
          <span style={{ color: "#1E293B", fontWeight: 600 }}>${pkg.weekday}</span> weekday
          <span style={{ margin: "0 6px", color: "#CBD5E1" }}>·</span>
          <span style={{ color: "#D97706", fontWeight: 600 }}>${pkg.weekend}</span> weekend
          <span style={{ margin: "0 6px", color: "#CBD5E1" }}>·</span>
          <span style={{ color: "#DC2626", fontWeight: 600 }}>+$75</span> holiday
          <div style={{ marginTop: 2, fontSize: 9 }}>Multi-day discounts apply automatically</div>
        </div>
      )}
      {!pkg && (
        <div style={{ marginTop: 8, display: "flex", gap: 12, justifyContent: "center" }}>
          <span style={{ fontSize: 10, color: "#D97706", fontWeight: 600 }}>● Weekend</span>
          <span style={{ fontSize: 10, color: "#DC2626", fontWeight: 600 }}>● Holiday</span>
        </div>
      )}
    </div>
  );
}

const navBtn = { background: "none", border: "1px solid #E2E8F0", borderRadius: 8, width: 34, height: 34, fontSize: 18, cursor: "pointer", color: "#1E293B", display: "flex", alignItems: "center", justifyContent: "center" };

export default function JetSkiBooking() {
  const [step, setStep] = useState(-1);
  const [pkg, setPkg] = useState(null);
  const [loc, setLoc] = useState(null);
  const [dates, setDates] = useState([]);
  const [mo, setMo] = useState(new Date().getMonth());
  const [yr, setYr] = useState(new Date().getFullYear());
  const [info, setInfo] = useState({ name: "", email: "", phone: "", experience: "", smsOptIn: false, dob: "" });
  const [done, setDone] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);
  const [fadeIn, setFadeIn] = useState(true);
  const [waiverChecks, setWaiverChecks] = useState({risks: false, release: false, indemnify: false, rules: false, damage: false, noInsurance: false, ais: false, noLakePowell: false});
  const [signature, setSignature] = useState(null);

  // ── Rental Agreement state (Phase 2) ────────────────────────────────
  // The customer must (1) scroll to the end of the document, then
  // (2) check all 5 acknowledgment boxes, then (3) sign via canvas.
  // These three gates ensure strong evidence of informed consent.
  const initialAgreementChecks = AGREEMENT_CHECKBOXES.reduce(
    (acc, cb) => ({ ...acc, [cb.id]: false }),
    {}
  );
  const [agreementChecks, setAgreementChecks] = useState(initialAgreementChecks);
  const [agreementSignature, setAgreementSignature] = useState(null);
  const [agreementScrollComplete, setAgreementScrollComplete] = useState(false);
  const [isDrawingAgreement, setIsDrawingAgreement] = useState(false);
  const agreementBottomRef = useRef(null);
  const agreementSigCanvasRef = useRef(null);
  // ─────────────────────────────────────────────────────────────────────
  const sigCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [bookedDates, setBookedDates] = useState([]);
  const [premiumDates, setPremiumDates] = useState([]);
  const [whiteGlove, setWhiteGlove] = useState(false);
  const [isRepeatCustomer, setIsRepeatCustomer] = useState(false);
  const [checkingCustomer, setCheckingCustomer] = useState(false);
  const [vestSizes, setVestSizes] = useState(EMPTY_VESTS);
  const [pickupTime, setPickupTime] = useState("08:00");
  const [returnTime, setReturnTime] = useState("20:00");
  const [overrideMinDays, setOverrideMinDays] = useState(false);

  // Read ?oc= param on mount. If it matches the operator override code, lift
  // the minimum-days restriction for all lakes for this session only.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('oc');
    if (code && code === 'lakeday1') {
      setOverrideMinDays(true);
    }
  }, []);

  useEffect(() => { setFadeIn(false); const t = setTimeout(() => setFadeIn(true), 20); return () => clearTimeout(t); }, [step]);

  useEffect(() => {
    if (pkg) {
      fetch(`/api/bookings?package=${encodeURIComponent(pkg.name)}`)
        .then(r => r.json())
        .then(data => { setBookedDates(data.bookedDates || []); setPremiumDates(data.premiumDates || []); })
        .catch(() => { setBookedDates([]); setPremiumDates([]); });
    }
  }, [pkg]);

  // If the customer switches to a location that doesn't support white glove
  // (currently just Lake Powell, which is quote-only), automatically turn off
  // any previously-selected white-glove toggle so the price stays accurate.
  useEffect(() => {
    if (loc && loc.whiteGloveFee === null) {
      setWhiteGlove(false);
    }
  }, [loc]);

  // If user switches packages and has more vests selected than the new package
  // can accommodate (including spare vest cap), clear the vest selection.
  // 2026-06-06: now compares against maxRiders + MAX_EXTRA_VESTS so a 6-vest
  // GTX selection auto-resets when user switches to Spark Duo (cap of 6 vests
  // total: 4 riders + 2 spares).
  useEffect(() => {
    if (!pkg) return;
    const total = Object.values(vestSizes).reduce((s, v) => s + v, 0);
    const cap = pkg.maxRiders + MAX_EXTRA_VESTS;
    if (total > cap) {
      setVestSizes(EMPTY_VESTS);
    }
  }, [pkg]);

  // ── Scroll-to-bottom detection for Rental Agreement (Phase 2) ─────────
  // Uses IntersectionObserver on a hidden marker at the end of the agreement
  // content. When the marker scrolls into view, we know the customer has at
  // least scrolled past every section. This unlocks the checkboxes (which
  // are disabled until scroll is complete). The state persists once true,
  // so navigating back-and-forth between steps doesn't lose the gate.
  useEffect(() => {
    if (step !== 5 || agreementScrollComplete) return;
    const marker = agreementBottomRef.current;
    if (!marker) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setAgreementScrollComplete(true);
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [step, agreementScrollComplete]);

  const handleDate = (d) => {
    if (dates.length === 0) {
      setDates([d]);
    } else if (dates.length === 2 && d > dates[1]) {
      setDates([dates[0], d]); // extend end — e.g. tap Jul 3, Jul 4, then Jul 5
    } else if (dates.length === 1 && d >= dates[0]) {
      setDates([dates[0], d]);
    } else {
      setDates([d]); // start fresh (clicked before start or within existing range)
    }
  };
  const changeMo = (dir) => {
    let m = mo + dir, y = yr;
    if (m > 11) { m = 0; y++; } if (m < 0) { m = 11; y--; }
    setMo(m); setYr(y);
  };

  const checkReturningCustomer = async () => {
    if (!info.email || !info.email.includes('@')) return;
    setCheckingCustomer(true);
    try {
      const res = await fetch('/api/check-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: info.email, phone: info.phone }),
      });
      const data = await res.json();
      setIsRepeatCustomer(data.isRepeat || false);
    } catch (err) {
      setIsRepeatCustomer(false);
    }
    setCheckingCustomer(false);
  };

  // Vest selection helpers
  const totalVests = Object.values(vestSizes).reduce((s, v) => s + v, 0);
  const maxVests = pkg?.maxRiders || 4;
  // 2026-06-06: hard cap is boat capacity + 2 spare vests
  const maxTotalVests = maxVests + MAX_EXTRA_VESTS;
  const spareVestCount = Math.max(0, totalVests - maxVests);
  const extraVestFee = spareVestCount * EXTRA_VEST_FEE;
  const incrementVest = (key) => {
    if (totalVests >= maxTotalVests) return; // hard cap including spares
    setVestSizes(prev => ({ ...prev, [key]: prev[key] + 1 }));
  };
  const decrementVest = (key) => {
    if (vestSizes[key] <= 0) return;
    setVestSizes(prev => ({ ...prev, [key]: prev[key] - 1 }));
  };
  // The "effective" vest selection — uses the customer's choices if any, otherwise
  // falls back to 2 Adult Mediums (the skippable default per the Phase 2 design).
  const getEffectiveVests = () => totalVests === 0 ? DEFAULT_VESTS : vestSizes;
  const effectiveVestSummary = formatVestSummary(getEffectiveVests(), maxVests);

  const handleCheckout = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const effective = getEffectiveVests();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageName: pkg.name,
          packageTagline: pkg.tagline,
          totalPrice: totalPrice,
          days: days,
          startDate: toISODate(dates[0]),
          endDate: dates.length === 2 ? toISODate(dates[1]) : toISODate(dates[0]),
          locationId: loc.id,
          location: loc.name,
          renterName: info.name,
          renterEmail: info.email,
          renterPhone: info.phone,
          renterDob: info.dob,
          experience: info.experience,
          smsOptIn: info.smsOptIn,
          whiteGlove: whiteGlove,
          whiteGloveFee: whiteGloveFee,
          holidaySurcharge: holidayInfo.total,
          deconFee: deconFee,
          isLakePowell: isLakePowell,
          loyaltyDiscount: loyaltyDiscount,
          vestSizes: JSON.stringify(effective),
          vestSummary: formatVestSummary(effective, pkg.maxRiders),
          vestUsedDefault: totalVests === 0,
          spareVestCount: spareVestCount,
          extraVestFee: extraVestFee,
          pickupTime: pickupTime,
          returnTime: returnTime,
          pickupTimeDisplay: formatTime12h(pickupTime),
          returnTimeDisplay: formatTime12h(returnTime),
          waiverSigned: 'true',
          waiverDate: new Date().toISOString(),
          // ── Rental Agreement (Phase 2) ──
          agreementSigned: 'true',
          agreementVersion: AGREEMENT_VERSION,
          agreementSignedAt: new Date().toISOString(),
          agreementChecksJson: JSON.stringify(agreementChecks),
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setPayError(data.error || 'Something went wrong. Please try again.');
        setPaying(false);
      }
    } catch (err) {
      setPayError('Connection error. Please try again.');
      setPaying(false);
    }
  };

  const days = dates.length === 2 ? daysBetween(dates[0], dates[1]) : dates.length === 1 ? 1 : 0;
  const basePrice = pkg && days > 0 ? calculateBasePrice(pkg, dates[0], dates.length === 2 ? dates[1] : dates[0]) : 0;
  const holidayInfo = dates.length > 0 ? getHolidaySurcharge(dates[0], dates.length === 2 ? dates[1] : dates[0]) : { total: 0, holidays: [] };
  const whiteGloveFee = (whiteGlove && loc?.whiteGloveFee) ? loc.whiteGloveFee : 0;
  const isLakePowell = loc?.id === "lake-powell";
  const deconFee = isLakePowell ? 200 : 0;
  const loyaltyDiscount = isRepeatCustomer ? Math.round(basePrice * 0.10) : 0;
  const { adjustment: promoAdjustment, reason: promoReason } = dates.length > 0
    ? computePremiumAdjustment(premiumDates, dates[0], dates.length === 2 ? dates[1] : dates[0], basePrice)
    : { adjustment: 0, reason: '' };
  const totalPrice = Math.max(0, basePrice + holidayInfo.total + whiteGloveFee + deconFee + extraVestFee - loyaltyDiscount + promoAdjustment);
  const minDaysRequired = loc?.minDays || 1;
  const meetsMinimum = overrideMinDays || days >= minDaysRequired;

  // ── Renter age policy: renters must be at least 25 as of the rental start date.
  // Client-side gate only — the authoritative check lives in /api/checkout. ──
  const MIN_RENTER_AGE = 25;
  const renterAge = (() => {
    if (!info.dob) return null;
    const [by, bm, bd] = info.dob.split('-').map(Number);
    if (!by || !bm || !bd) return null;
    const born = new Date(by, bm - 1, bd);
    if (isNaN(born.getTime())) return null;
    const ref = dates.length > 0 ? dates[0] : new Date(); // age as of rental start date
    let age = ref.getFullYear() - born.getFullYear();
    const mo = ref.getMonth() - born.getMonth();
    if (mo < 0 || (mo === 0 && ref.getDate() < born.getDate())) age--;
    return age;
  })();
  const isOldEnough = renterAge != null && renterAge >= MIN_RENTER_AGE;
  // For same-day rentals, pickup must come before return. Multi-day has no
  // constraint (pickup Day 1 AM, return Day N PM regardless of clock time).
  const timesValid = days <= 1
    ? timeToMinutes(pickupTime) < timeToMinutes(returnTime)
    : true;

  const canNext = () => {
    if (step === 0) return pkg;
    if (step === 1) return loc;
    if (step === 2) return dates.length >= 1 && meetsMinimum && timesValid;
    if (step === 3) return info.name && info.email && info.phone && info.experience && info.dob && isOldEnough && totalVests <= maxTotalVests;
    if (step === 4) return Object.values(waiverChecks).every(Boolean) && signature;
    // Step 5 (NEW): scroll-gated rental agreement
    if (step === 5) return agreementScrollComplete
      && Object.values(agreementChecks).every(Boolean)
      && agreementSignature;
    if (step === 6) return true;
    return false;
  };

  const stepLabels = ["Package", "Location", "Dates", "Info", "Waiver", "Agreement", "Confirm"];

  if (step === -1) {
    return (
      <div style={{
        "--font-body": "'Outfit', sans-serif",
        "--font-heading": "'Playfair Display', serif",
        minHeight: "100vh",
        background: "#0B1120",
        color: "#fff",
        fontFamily: "var(--font-body)",
        overflow: "hidden",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,600&display=swap" rel="stylesheet" />

        <div style={{ position: "relative", height: 420, overflow: "hidden" }}>
          <img src={IMAGES.sparkHero} alt="Sea-Doo Sparks on Utah reservoir" style={{
            width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%",
            filter: "brightness(0.7) contrast(1.1)",
          }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, rgba(11,17,32,0.3) 0%, rgba(11,17,32,0.1) 40%, rgba(11,17,32,0.85) 85%, #0B1120 100%)",
          }} />
          <div style={{ position: "absolute", bottom: 32, left: 0, right: 0, padding: "0 24px", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <img src="/images/logo.png" alt="Full Throttle Utah" style={{
              width: "85%", maxWidth: 380, height: "auto", marginBottom: 12,
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))",
            }} />
            <p style={{ fontSize: 15, color: "#94A3B8", marginTop: 4, lineHeight: 1.5, maxWidth: 340, textAlign: "center" }}>
              Premium jet ski, UTV, and powersport rentals across every major Utah destination. Book online in 2 minutes.
            </p>
          </div>
        </div>

        <div style={{ padding: "32px 20px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#64748B", marginBottom: 20 }}>
            Our Fleet
          </div>

          {PACKAGES.map((p, idx) => (
            <div key={p.id} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 16, padding: 0, marginBottom: 16, overflow: "hidden",
              backdropFilter: "blur(20px)",
            }}>
              <img src={IMAGES[p.heroImg]} alt={p.name} style={{
                width: "100%", height: 160, objectFit: "contain",
                background: idx === 0 ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" : "linear-gradient(135deg, #1a1a2e 0%, #2d1f0f 100%)",
              }} />
              <div style={{ padding: "16px 20px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{p.tagline}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#64748B", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>From</div>
                    <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>${p.weekday}</div>
                    <div style={{ fontSize: 10, color: "#64748B" }}>/day</div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "16px 20px", marginBottom: 16,
            backdropFilter: "blur(20px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>🤝</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>White Glove Delivery</div>
                <div style={{ fontSize: 11, color: "#94A3B8" }}>Starting at $150, varies by destination</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
              Skip the towing. We bring the watercraft to your lake, launch it, and pick it up when you're done. Pricing is location-based — nearby lakes start at $150. You'll see the exact fee for your chosen destination when you book.
            </div>
          </div>

          <button onClick={() => setStep(0)} style={{
            width: "100%", padding: "18px 24px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)",
            color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
            letterSpacing: "-0.01em", fontFamily: "var(--font-body)",
            boxShadow: "0 4px 24px rgba(14,165,233,0.3)",
            marginTop: 8,
          }}>
            Book Your Ride →
          </button>

          <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 28 }}>
            {[
              { icon: "🛡️", label: "Insured" },
              { icon: "📋", label: "Digital Waiver" },
              { icon: "💳", label: "Pay Online" },
              { icon: "🚛", label: "You Tow" },
            ].map(t => (
              <div key={t.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20 }}>{t.icon}</div>
                <div style={{ fontSize: 9, color: "#64748B", fontWeight: 600, marginTop: 4, letterSpacing: "0.05em", textTransform: "uppercase" }}>{t.label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 36 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#64748B", marginBottom: 14 }}>
              We Serve
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {LOCATIONS.map(l => (
                <span key={l.id} style={{
                  fontSize: 12, color: "#94A3B8", background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20,
                  padding: "6px 14px", fontWeight: 500,
                }}>
                  {l.emoji} {l.name}
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
            <img src="/images/logo.png" alt="Full Throttle Utah" style={{ width: 160, height: "auto", marginBottom: 12, opacity: 0.6 }} />
            <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
              Pickup from Farmington, UT · 8 AM – 8 PM<br/>
              2" ball hitch + valid ID required<br/>
              <a href="/cancellation-policy" style={{ color: "#0EA5E9", textDecoration: "none" }}>Cancellation & Weather Policy</a><br/>
              <span style={{ color: "#64748B" }}>© {new Date().getFullYear()} TW Assets LLC d/b/a Full Throttle Utah</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      "--font-body": "'Outfit', sans-serif",
      "--font-heading": "'Playfair Display', serif",
      minHeight: "100vh",
      background: "linear-gradient(180deg, #F0F9FF 0%, #FAFBFC 30%, #fff 100%)",
      fontFamily: "var(--font-body)",
      color: "#0F172A",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,600&display=swap" rel="stylesheet" />

      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => step === 0 ? setStep(-1) : setStep(step - 1)} style={{
          background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#64748B", padding: "4px 8px",
        }}>←</button>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/images/logo.png" alt="Full Throttle Utah" style={{ height: 32, width: "auto" }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", letterSpacing: "-0.01em" }}>{stepLabels[step] || "Confirm"}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8" }}>
          {step + 1}/{stepLabels.length}
        </div>
      </div>

      <div style={{ height: 3, background: "#E2E8F0", margin: "0 20px", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", background: "linear-gradient(90deg, #0EA5E9, #0284C7)",
          width: `${((step + 1) / stepLabels.length) * 100}%`,
          borderRadius: 2, transition: "width 0.4s ease",
        }} />
      </div>

      <div style={{
        maxWidth: 480, margin: "0 auto", padding: "24px 20px 140px",
        opacity: fadeIn ? 1 : 0, transform: fadeIn ? "none" : "translateY(10px)",
        transition: "opacity 0.3s, transform 0.3s",
      }}>

        {step === 0 && !done && (
          <div>
            <h2 style={secTitle}>Choose Your Ride</h2>
            {PACKAGES.map(p => {
              const isSel = pkg?.id === p.id;
              return (
                <div key={p.id} onClick={() => setPkg(p)} style={{
                  border: isSel ? `2px solid ${p.accent}` : "2px solid #E2E8F0",
                  borderRadius: 18, marginBottom: 16, overflow: "hidden", cursor: "pointer",
                  background: isSel ? p.accentLight : "#fff",
                  transition: "all 0.2s",
                  boxShadow: isSel ? `0 4px 20px ${p.accentLight}` : "0 1px 3px rgba(0,0,0,0.04)",
                }}>
                  <ImageGallery images={[p.heroImg, ...p.galleryImgs]} />
                  <div style={{ padding: "18px 20px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 2, fontWeight: 500 }}>{p.tagline}</div>
                      </div>
                      {p.id === "gtx-duo" && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                          background: "#B8860B", color: "#fff", padding: "4px 10px", borderRadius: 6,
                        }}>Premium</span>
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.55, margin: "12px 0 16px" }}>{p.description}</p>
                    <div style={{ display: "flex", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Mon–Thu</div>
                        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: "#0F172A" }}>${p.weekday}</div>
                      </div>
                      <div style={{ width: 1, background: "#E2E8F0" }} />
                      <div>
                        <div style={{ fontSize: 9, color: "#D97706", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Fri–Sun</div>
                        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: "#0F172A" }}>${p.weekend}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {p.includes.map((item, i) => (
                        <span key={i} style={{
                          fontSize: 10, background: "rgba(0,0,0,0.03)", padding: "4px 10px",
                          borderRadius: 20, color: "#64748B", fontWeight: 500,
                        }}>✓ {item}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {pkg && (
              <div style={{ background: "#F8FAFC", borderRadius: 14, padding: 18, border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Multi-Day Discounts</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, textAlign: "center" }}>
                  {Object.entries(pkg.multiDay).map(([d, r]) => (
                    <div key={d}>
                      <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>{d}+ days</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>${r}</div>
                      <div style={{ fontSize: 9, color: "#94A3B8" }}>/day</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 1 && !done && (
          <div>
            <h2 style={secTitle}>Pick Your Lake</h2>
            {LOCATIONS.map(l => (
              <div key={l.id} onClick={() => setLoc(l)} style={{
                border: loc?.id === l.id ? "2px solid #0C4A6E" : "2px solid #E2E8F0",
                borderRadius: 14, padding: "16px 18px", marginBottom: 10, cursor: "pointer",
                background: loc?.id === l.id ? "#F0F9FF" : "#fff",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                transition: "all 0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{l.emoji}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {l.name}
                      {l.aisStatus === "infested" && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#D97706", background: "#FEF3C7", padding: "2px 6px", borderRadius: 4, marginLeft: 6, letterSpacing: "0.05em" }}>AIS</span>
                      )}
                      {l.minDays && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#0C4A6E", background: "#DBEAFE", padding: "2px 6px", borderRadius: 4, marginLeft: 6, letterSpacing: "0.05em" }}>{l.minDays}-DAY MIN</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{l.region}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{l.drive}</div>
              </div>
            ))}

            {loc?.aisStatus === "infested" && (
              <div style={{ marginTop: 12, padding: 14, background: "#FEF3C7", borderRadius: 14, border: "2px solid #D97706" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 2 }}>Lake Powell Special Requirements</div>
                    <div style={{ fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>Quagga mussel-infested waterbody. Per Utah DWR:</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#92400E", lineHeight: 1.7, paddingLeft: 26 }}>
                  • <strong>3-day minimum</strong> rental required<br/>
                  • <strong>$200 decontamination fee</strong> auto-added<br/>
                  • Professional decon performed at return<br/>
                  • Machine quarantined 30 days after use
                </div>
              </div>
            )}

            {loc?.minDays && loc?.aisStatus !== "infested" && !overrideMinDays && (
              <div style={{ marginTop: 12, padding: 14, background: "#DBEAFE", borderRadius: 14, border: "2px solid #2563EB" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📍</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1E40AF", marginBottom: 2 }}>{loc.name} — {loc.minDays}-day minimum rental</div>
                    <div style={{ fontSize: 11, color: "#1E40AF", lineHeight: 1.5 }}>
                      This destination is {loc.drive} from Farmington each way. To make the trip worthwhile for you (and for us to dedicate the watercraft to your reservation), we require a minimum {loc.minDays}-day booking. Multi-day discount automatically applies.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {loc && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Add-On Service</div>

                {loc.whiteGloveFee === null ? (
                  <div style={{
                    border: "2px solid #E2E8F0",
                    borderRadius: 14, padding: "16px 18px",
                    background: "#fff",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 22 }}>🤝</span>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>White Glove Delivery</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{loc.name} — call for quote</div>
                        </div>
                      </div>
                      <a href="tel:+17148566576" style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "#0C4A6E", color: "#fff", padding: "10px 14px",
                        borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 600,
                      }}>
                        📞 Call
                      </a>
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F1F5F9", fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
                      Lake Powell deliveries are 600+ mile round-trips and quoted individually. Call us at (714) 856-5676 to discuss your trip and pricing.
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setWhiteGlove(!whiteGlove)}
                    style={{
                      border: whiteGlove ? "2px solid #16A34A" : "2px solid #E2E8F0",
                      borderRadius: 14, padding: "16px 18px", cursor: "pointer",
                      background: whiteGlove ? "rgba(22,163,74,0.04)" : "#fff",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 22 }}>🤝</span>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>White Glove Delivery</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>We deliver, launch & retrieve at {loc.name}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: whiteGlove ? "#16A34A" : "#0F172A" }}>+${loc.whiteGloveFee}</div>
                        <div style={{
                          width: 24, height: 24, borderRadius: 6,
                          border: whiteGlove ? "2px solid #16A34A" : "2px solid #CBD5E1",
                          background: whiteGlove ? "#16A34A" : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, color: "#fff", fontWeight: 700,
                          transition: "all 0.15s",
                        }}>
                          {whiteGlove ? "✓" : ""}
                        </div>
                      </div>
                    </div>
                    {whiteGlove && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(22,163,74,0.15)", fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
                        We'll deliver your watercraft to the ramp at {loc.name}, launch it, and pick it up when you're done. No towing needed — just show up and ride. Fee covers all delivery, launch, and recovery costs; no additional fuel charges at pickup.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 16, padding: 14, background: "#F0F9FF", borderRadius: 12, border: "1px solid #DBEAFE" }}>
              <div style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.5 }}>
                <strong>{whiteGlove ? "We deliver to the lake!" : "Pickup:"}</strong> {whiteGlove ? `We'll bring the watercraft to ${loc?.name || "your chosen lake"} and launch it for you.` : "Farmington, UT — you tow to the lake with your own vehicle. 2\" ball hitch and flat 4-prong light hookup required."}
              </div>
            </div>
          </div>
        )}

        {step === 2 && !done && (
          <div>
            <h2 style={secTitle}>Select Your Dates</h2>
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
              <Calendar selectedDates={dates} onSelectDate={handleDate} month={mo} year={yr} onChangeMonth={changeMo} bookedDates={bookedDates} pkg={pkg} premiumDates={premiumDates} />
            </div>

            {loc?.minDays && days > 0 && days < loc.minDays && !overrideMinDays && (
              <div style={{ marginTop: 14, padding: 14, background: "#FEE2E2", borderRadius: 12, border: "2px solid #DC2626" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#991B1B", marginBottom: 4 }}>
                  ⚠️ {loc.name} requires {loc.minDays}+ day rental
                </div>
                <div style={{ fontSize: 12, color: "#991B1B", lineHeight: 1.5 }}>
                  {isLakePowell
                    ? `Due to mandatory 30-day machine quarantine after Lake Powell use, we require a minimum ${loc.minDays}-day booking. Please extend your date range.`
                    : `Due to the long travel distance (${loc.drive} each way), ${loc.name} rentals require a minimum ${loc.minDays}-day booking to make the trip worthwhile. Please extend your date range.`}
                </div>
              </div>
            )}

            {days > 0 && meetsMinimum && (
              <div style={{
                marginTop: 14, background: "#0C4A6E", borderRadius: 14, padding: "16px 18px",
                color: "#fff",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>{days} day{days > 1 ? "s" : ""}</div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {formatDate(dates[0])}{dates.length === 2 ? ` → ${formatDate(dates[1])}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>${totalPrice.toLocaleString()}</div>
                    {days > 1 && <div style={{ fontSize: 11, opacity: 0.6 }}>${Math.round(totalPrice/days)}/day avg</div>}
                  </div>
                </div>
                {(holidayInfo.total > 0 || whiteGlove || deconFee > 0 || loyaltyDiscount > 0 || extraVestFee > 0 || promoAdjustment !== 0) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.15)", fontSize: 11, opacity: 0.7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span>Base rental</span><span>${basePrice.toLocaleString()}</span>
                    </div>
                    {holidayInfo.holidays.map(h => (
                      <div key={h.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: "#FCA5A5" }}>
                        <span>🎆 {h.name} surcharge</span><span>+${h.premium}/day</span>
                      </div>
                    ))}
                    {whiteGlove && whiteGloveFee > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: "#86EFAC" }}>
                        <span>🤝 White glove — {loc.name}</span><span>+${whiteGloveFee}</span>
                      </div>
                    )}
                    {deconFee > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: "#FCD34D" }}>
                        <span>🦠 Lake Powell decontamination</span><span>+${deconFee}</span>
                      </div>
                    )}
                    {extraVestFee > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: "#FCD34D" }}>
                        <span>🪖 Spare vest{spareVestCount === 1 ? "" : "s"} ({spareVestCount} × ${EXTRA_VEST_FEE})</span><span>+${extraVestFee}</span>
                      </div>
                    )}
                    {loyaltyDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: "#86EFAC" }}>
                        <span>✨ Returning customer</span><span>-${loyaltyDiscount}</span>
                      </div>
                    )}
                    {promoAdjustment < 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: "#86EFAC" }}>
                        <span>🏷️ {promoReason || "Promo"}</span><span>-${Math.abs(promoAdjustment)}</span>
                      </div>
                    )}
                    {promoAdjustment > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, color: "#FCA5A5" }}>
                        <span>📈 {promoReason || "Surcharge"}</span><span>+${promoAdjustment}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── PICKUP & RETURN TIMES (2026-06-02 PM) ───────────────────
                Shown as soon as the customer picks any date. Labels adapt for
                white-glove (delivery to lake) vs. self-tow (Farmington pickup).
                Defaults: 8 AM pickup, 8 PM return — same as the prior hardcoded
                behavior, so existing language elsewhere stays accurate. */}
            {dates.length > 0 && (
              <div style={{ marginTop: 14, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                  ⏰ Pickup & Return Times
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 6, display: "block" }}>
                      {whiteGlove ? "Deliver to lake" : "Pickup at Farmington"}
                    </label>
                    <select
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      style={{
                        width: "100%", padding: "12px 10px", borderRadius: 10,
                        border: timesValid ? "2px solid #E2E8F0" : "2px solid #DC2626",
                        fontSize: 14, color: "#0F172A",
                        background: "#fff", outline: "none",
                        fontFamily: "'Outfit', sans-serif",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                    >
                      {PICKUP_SLOTS.map(t => (
                        <option key={t} value={t}>{formatTime12h(t)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#64748B", marginBottom: 6, display: "block" }}>
                      {whiteGlove ? "Pick up from lake" : "Return to Farmington"}
                    </label>
                    <select
                      value={returnTime}
                      onChange={(e) => setReturnTime(e.target.value)}
                      style={{
                        width: "100%", padding: "12px 10px", borderRadius: 10,
                        border: timesValid ? "2px solid #E2E8F0" : "2px solid #DC2626",
                        fontSize: 14, color: "#0F172A",
                        background: "#fff", outline: "none",
                        fontFamily: "'Outfit', sans-serif",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                    >
                      {RETURN_SLOTS.map(t => (
                        <option key={t} value={t}>{formatTime12h(t)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {!timesValid && (
                  <div style={{ fontSize: 11, color: "#991B1B", marginTop: 10, padding: "8px 10px", background: "#FEE2E2", borderRadius: 6, fontWeight: 600 }}>
                    ⚠️ For same-day rentals, return time must be after pickup time.
                  </div>
                )}

                <div style={{ fontSize: 12, color: "#92400E", marginTop: 12, padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, lineHeight: 1.5 }}>
                  ⏱ Arriving more than 1 hour past your scheduled pickup time may result in a <strong>$50 late pickup fee</strong> charged to your card on file.
                </div>

                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
                  {whiteGlove
                    ? `We'll confirm exact delivery & retrieval times by phone after you book.`
                    : days > 1
                    ? `Pickup on ${formatDate(dates[0])} · Return on ${dates.length === 2 ? formatDate(dates[1]) : formatDate(dates[0])}`
                    : `Same-day rental — both times on ${formatDate(dates[0])}`}
                </div>
              </div>
            )}

            <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 16 }}>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>Tap start → end for multi-day</span>
            </div>
          </div>
        )}

        {step === 3 && !done && (
          <div>
            <h2 style={secTitle}>Your Information</h2>
            {[
              { k: "name", label: "Full Name", type: "text", ph: "John Smith" },
              { k: "email", label: "Email", type: "email", ph: "you@email.com" },
              { k: "phone", label: "Phone", type: "tel", ph: "(801) 555-1234" },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 14 }}>
                <label style={labelSt}>{f.label}</label>
                <input type={f.type} placeholder={f.ph} value={info[f.k]}
                  onChange={e => setInfo({ ...info, [f.k]: e.target.value })}
                  onBlur={() => (f.k === 'email' || f.k === 'phone') && checkReturningCustomer()}
                  style={inputSt}
                />
                {f.k === 'phone' && isRepeatCustomer && (
                  <div style={{ marginTop: 8, padding: 10, background: "rgba(22,163,74,0.08)", borderRadius: 8, border: "1px solid #16A34A", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>✨</span>
                    <div style={{ fontSize: 12, color: "#15803D", lineHeight: 1.4 }}>
                      <strong>Welcome back!</strong> You're getting 10% off your rental as a returning customer.
                    </div>
                  </div>
                )}
                {f.k === 'phone' && checkingCustomer && (
                  <div style={{ marginTop: 6, fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>
                    Checking your account...
                  </div>
                )}
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label style={labelSt}>Date of Birth</label>
              <input
                type="date"
                value={info.dob}
                max={new Date().toISOString().split("T")[0]}
                onChange={e => setInfo({ ...info, dob: e.target.value })}
                style={inputSt}
              />
              {info.dob && !isOldEnough && (
                <div style={{ marginTop: 8, padding: 12, background: "rgba(220,38,38,0.08)", borderRadius: 8, border: "1px solid #DC2626" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#991B1B", marginBottom: 2 }}>Renters must be 25 or older</div>
                  <div style={{ fontSize: 12, color: "#991B1B", lineHeight: 1.4 }}>
                    We're sorry — Full Throttle Utah rents only to renters who are at least 25 years old, so we're unable to complete this booking.
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14, background: "#FEF3C7", borderRadius: 12, padding: 14, display: "flex", gap: 10 }}>
              <span style={{ fontSize: 18 }}>🪪</span>
              <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
                <strong>Renters must be 25 or older.</strong> Bring a valid driver's license — we verify age with a photo-ID check at pickup. If the renter is not 25+, the rental is denied and refunded minus one rental day's rate as an administrative fee.
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelSt}>Jet Ski Experience</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {["First timer", "A few times", "Experienced", "Expert"].map(lv => (
                  <div key={lv} onClick={() => setInfo({ ...info, experience: lv })} style={{
                    padding: "12px", borderRadius: 10,
                    border: info.experience === lv ? "2px solid #0C4A6E" : "2px solid #E2E8F0",
                    background: info.experience === lv ? "#F0F9FF" : "#fff",
                    cursor: "pointer", fontSize: 13, textAlign: "center",
                    fontWeight: info.experience === lv ? 600 : 400,
                    color: info.experience === lv ? "#0C4A6E" : "#64748B",
                    transition: "all 0.15s",
                  }}>{lv}</div>
                ))}
              </div>
            </div>
            <div style={{ background: "#FEF3C7", borderRadius: 12, padding: 14, display: "flex", gap: 10 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
                <strong>Digital waiver required.</strong> After booking you'll receive a Smartwaiver link. All riders must sign before pickup.
              </div>
            </div>

            <div style={{ marginTop: 14, border: "2px solid #E2E8F0", borderRadius: 12, padding: 14, background: info.smsOptIn ? "rgba(14,165,233,0.04)" : "#fff" }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={info.smsOptIn}
                  onChange={() => setInfo({ ...info, smsOptIn: !info.smsOptIn })}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: "#0C4A6E", cursor: "pointer", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>
                    📱 Text me booking updates <span style={{ color: "#64748B", fontWeight: 400, fontStyle: "italic" }}>(Optional)</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.5 }}>
                    I agree to receive SMS notifications from Full Throttle Utah about my reservation (booking confirmation, pickup/return reminders, and follow-up). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out.
                  </div>
                  <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, fontStyle: "italic" }}>
                    Consent is not required to complete your booking — you'll still receive email confirmations.
                  </div>
                </div>
              </label>
            </div>

            {/* ─── LIFE VEST SELECTION ────────────────────────────────────────
                Skippable. If totalVests === 0 at checkout, we default to 2
                Adult Mediums (one per operator). Capped at pkg.maxRiders for
                included vests; additional vests up to MAX_EXTRA_VESTS are
                billed as $15 spares (2026-06-06). Boat capacity (USCG rated
                riders per ski × number of skis) remains the hard limit on
                actual rider count regardless of vest count. */}
            <div style={{ marginTop: 14, border: "2px solid #E2E8F0", borderRadius: 12, padding: 16, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>🦺 Life Vests</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.05em", textTransform: "uppercase" }}>Optional</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 4, lineHeight: 1.5 }}>
                    USCG-approved PFDs. {maxVests} included free (one per seat). Skip and we'll bring 2 Adult Mediums.
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", lineHeight: 1 }}>
                    {totalVests}
                    <span style={{ fontSize: 13, color: "#94A3B8", fontWeight: 500 }}> / {maxVests}</span>
                    {spareVestCount > 0 && (
                      <span style={{ fontSize: 13, color: "#F59E0B", fontWeight: 700 }}> +{spareVestCount}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: "#94A3B8", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
                    {spareVestCount > 0 ? "Riders + Spares" : "Riders"}
                  </div>
                </div>
              </div>

              {/* Spare vest fee notice — shows when at least 1 spare is being purchased */}
              {spareVestCount > 0 && (
                <div style={{ fontSize: 11, color: "#92400E", marginBottom: 12, padding: "8px 10px", background: "#FEF3C7", borderRadius: 6, lineHeight: 1.45 }}>
                  <strong>🪖 {spareVestCount} spare vest{spareVestCount === 1 ? "" : "s"} (+${extraVestFee})</strong> — boat capacity stays at {maxVests} riders. Spares are backups (sizing, wet, rotation).
                </div>
              )}

              {/* Hard cap reached — purely informational, the + buttons are also disabled */}
              {totalVests >= maxTotalVests && (
                <div style={{ fontSize: 11, color: "#991B1B", marginBottom: 12, padding: "8px 10px", background: "#FEE2E2", borderRadius: 6, fontWeight: 600 }}>
                  Maximum reached: {maxVests} riders + {MAX_EXTRA_VESTS} spare vests.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {VEST_SIZES.map(s => {
                  const count = vestSizes[s.key];
                  const isSel = count > 0;
                  const canIncrement = totalVests < maxTotalVests;
                  // Visual cue: when adding the next vest would be a spare, show
                  // a small "+$15" hint on the + button so the user knows the cost.
                  const nextIsSpare = totalVests >= maxVests && totalVests < maxTotalVests;
                  return (
                    <div key={s.key} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 12px", borderRadius: 8,
                      background: isSel ? "rgba(14,165,233,0.05)" : "#F8FAFC",
                      border: isSel ? "1px solid #0EA5E9" : "1px solid #F1F5F9",
                      transition: "all 0.15s",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{s.label}</div>
                        {s.hint && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>{s.hint}</div>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => decrementVest(s.key)}
                          disabled={count === 0}
                          aria-label={`Remove one ${s.label}`}
                          style={{
                            width: 30, height: 30, borderRadius: 6,
                            border: "1px solid #CBD5E1", background: "#fff",
                            cursor: count === 0 ? "not-allowed" : "pointer",
                            fontSize: 18, fontWeight: 700, color: "#64748B",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            opacity: count === 0 ? 0.4 : 1,
                            padding: 0, lineHeight: 1,
                          }}
                        >−</button>
                        <div style={{ minWidth: 22, textAlign: "center", fontSize: 15, fontWeight: 700, color: isSel ? "#0EA5E9" : "#94A3B8" }}>
                          {count}
                        </div>
                        <button
                          onClick={() => incrementVest(s.key)}
                          disabled={!canIncrement}
                          aria-label={`Add one ${s.label}${nextIsSpare ? " (spare, +$15)" : ""}`}
                          title={nextIsSpare ? "Next vest is a spare (+$15)" : undefined}
                          style={{
                            position: "relative",
                            width: 30, height: 30, borderRadius: 6,
                            border: nextIsSpare ? "1px solid #F59E0B" : "1px solid #CBD5E1",
                            background: nextIsSpare ? "rgba(245,158,11,0.06)" : "#fff",
                            cursor: canIncrement ? "pointer" : "not-allowed",
                            fontSize: 18, fontWeight: 700,
                            color: nextIsSpare ? "#92400E" : "#64748B",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            opacity: canIncrement ? 1 : 0.4,
                            padding: 0, lineHeight: 1,
                          }}
                        >+</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 10, padding: "8px 10px", background: "#F8FAFC", borderRadius: 6, fontSize: 10, color: "#64748B", lineHeight: 1.5, textAlign: "center" }}>
                <strong>Boat capacity: {maxVests} riders</strong> ({pkg?.id === "gtx-duo" ? "3 per GTX × 2 skis" : pkg?.id === "trixx-single" ? "3 on one Trixx" : "2 per Spark × 2 skis"}). Spare vests $15 each (max +{MAX_EXTRA_VESTS}). Actual rider count cannot exceed boat capacity.
              </div>
            </div>
          </div>
        )}

        {step === 4 && !done && (
          <div>
            <h2 style={secTitle}>Liability Waiver</h2>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 16 }}>
              Please read each section carefully and check each box to acknowledge you understand and agree.
            </div>

            {[
              { key: "risks", title: "Acknowledgment of Risks",
                text: "I understand that operating a personal watercraft involves serious risks including collision, capsizing, drowning, equipment malfunction, and injuries from jet propulsion systems. These risks can result in bodily injury, permanent disability, or death." },
              { key: "release", title: "Waiver & Release of Liability",
                text: "To the fullest extent permitted by Utah law, I forever release, waive, and discharge TW Assets LLC, its members, managers, employees, and agents from any and all liability, claims, damages, and costs arising from the rental and use of the PWC and equipment, including claims arising from the negligence of TW Assets LLC. This release does not apply to willful misconduct or gross negligence." },
              { key: "indemnify", title: "Indemnification",
                text: "I agree to indemnify, defend, and hold harmless TW Assets LLC from any claims, damages, or expenses brought by any person arising from my rental, use, or transport of the PWC and equipment." },
              { key: "rules", title: "Renter Obligations",
                text: "I confirm that: I am the renter and am at least 25 years old with a valid driver's license, and I understand my ID will be verified at pickup. All operators will be 16+ per Utah Code §73-18-15.1. All riders will wear USCG-approved life vests at all times. I will not operate under the influence of alcohol or drugs. I have inspected the equipment and accept it in safe working condition. I will comply with all applicable boating laws." },
              { key: "damage", title: "Damage & Security Deposit",
                text: `I accept financial responsibility for all damage to, loss of, or theft of the PWC and equipment during the rental period, regardless of fault. A $${(pkg?.deposit || 1000).toLocaleString()} security deposit will be collected and refunded upon satisfactory return.` },
              { key: "noInsurance", title: "No Insurance Provided",
                text: "I understand that TW Assets LLC does not provide collision, liability, or personal injury insurance for renters, passengers, or third parties. I assume all financial risk for any uninsured loss." },
              { key: "ais", title: "Aquatic Invasive Species (AIS) Compliance",
                text: "I acknowledge that Utah requires all boaters to complete the annual Mussel Aware Boater Course before launching any watercraft. The Utah AIS registration and certificate are stored inside this PWC. I agree to: (1) stop at all operating AIS inspection stations, (2) remove all drain plugs before transport, (3) clean, drain, and dry the watercraft after every use, and (4) NOT transport this watercraft to any out-of-state waterbody without prior written permission from Full Throttle Utah." },
              { key: "noLakePowell", title: isLakePowell ? "Lake Powell Decontamination Acknowledgment" : "Mussel-Infested Water Prohibition",
                text: isLakePowell
                  ? "I understand Lake Powell is a quagga mussel-infested waterbody. I agree to the $200 mandatory decontamination fee. I will not launch this watercraft at any other Utah waterbody for 30 days after Lake Powell use without prior written permission from Full Throttle Utah. I will follow all DWR clean/drain/dry protocols when exiting Lake Powell, remove all drain plugs, and submit to inspection at any operating AIS station."
                  : "I agree NOT to transport or operate this watercraft at Lake Powell, Lake Mead, or any other mussel-infested waterbody during the rental period. I understand that violation of this agreement will result in a $500 contamination fee, forfeiture of the security deposit, and additional liability for revenue lost during the resulting 30-day machine quarantine." },
            ].map(section => (
              <div key={section.key} style={{
                marginBottom: 12,
                border: waiverChecks[section.key] ? "2px solid #16A34A" : "2px solid #E2E8F0",
                borderRadius: 14, overflow: "hidden",
                background: waiverChecks[section.key] ? "rgba(22,163,74,0.04)" : "#fff",
                transition: "all 0.2s",
              }}>
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{section.title}</div>
                  <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.55 }}>{section.text}</div>
                  <label style={{
                    display: "flex", alignItems: "center", gap: 10, marginTop: 10,
                    cursor: "pointer", fontSize: 13, fontWeight: 600,
                    color: waiverChecks[section.key] ? "#16A34A" : "#64748B",
                  }}>
                    <input
                      type="checkbox"
                      checked={waiverChecks[section.key]}
                      onChange={() => setWaiverChecks(prev => ({...prev, [section.key]: !prev[section.key]}))}
                      style={{ width: 20, height: 20, accentColor: "#16A34A", cursor: "pointer" }}
                    />
                    I understand and agree
                  </label>
                </div>
              </div>
            ))}

            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Your Signature</div>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>
                Draw your signature below using your finger or mouse.
              </div>
              <div style={{ position: "relative" }}>
                <canvas
                  ref={sigCanvasRef}
                  width={440}
                  height={140}
                  style={{
                    border: signature ? "2px solid #16A34A" : "2px solid #CBD5E1",
                    borderRadius: 12, width: "100%", height: 140,
                    background: "#FAFBFC", cursor: "crosshair",
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => {
                    const canvas = sigCanvasRef.current;
                    const rect = canvas.getBoundingClientRect();
                    const ctx = canvas.getContext("2d");
                    ctx.beginPath();
                    ctx.moveTo(
                      (e.clientX - rect.left) * (canvas.width / rect.width),
                      (e.clientY - rect.top) * (canvas.height / rect.height)
                    );
                    setIsDrawing(true);
                    canvas.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!isDrawing) return;
                    const canvas = sigCanvasRef.current;
                    const rect = canvas.getBoundingClientRect();
                    const ctx = canvas.getContext("2d");
                    ctx.strokeStyle = "#0F172A";
                    ctx.lineWidth = 2.5;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.lineTo(
                      (e.clientX - rect.left) * (canvas.width / rect.width),
                      (e.clientY - rect.top) * (canvas.height / rect.height)
                    );
                    ctx.stroke();
                  }}
                  onPointerUp={() => {
                    setIsDrawing(false);
                    setSignature(sigCanvasRef.current.toDataURL());
                  }}
                />
                {!signature && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    fontSize: 13, color: "#CBD5E1", fontWeight: 500,
                    pointerEvents: "none",
                  }}>
                    Sign here
                  </div>
                )}
              </div>
              {signature && (
                <button
                  onClick={() => {
                    const canvas = sigCanvasRef.current;
                    const ctx = canvas.getContext("2d");
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    setSignature(null);
                  }}
                  style={{
                    marginTop: 8, background: "none", border: "none",
                    color: "#EF4444", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", padding: "4px 0",
                  }}
                >
                  Clear signature
                </button>
              )}
            </div>

            <div style={{
              marginTop: 16, padding: 14, background: "#F0F9FF",
              borderRadius: 12, border: "1px solid #DBEAFE",
            }}>
              <div style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.5 }}>
                <strong>Signed by:</strong> {info.name} · {info.email}<br/>
                <strong>Date:</strong> {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}<br/>
                <strong>IP address and timestamp</strong> will be recorded with this agreement.
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════
            STEP 5 — RENTAL AGREEMENT (Phase 2)
            Single scrollable document with three gates before Continue activates:
              1. Customer must scroll to the bottom of the agreement (IntersectionObserver)
              2. Customer must check all 5 acknowledgment boxes
              3. Customer must sign via canvas
            All three gates feed into canNext() for step === 5.
        ═══════════════════════════════════════════════════════════════════════ */}
        {step === 5 && !done && (
          <div>
            <h2 style={secTitle}>Rental Agreement</h2>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 14 }}>
              Please read the entire agreement, acknowledge each item below, and sign at the bottom. This is separate from the Liability Waiver you just signed.
            </div>

            {/* ── Sticky reading progress indicator ───────────────────────── */}
            <div style={{
              position: "sticky", top: 0, zIndex: 5,
              marginBottom: 14, padding: "10px 14px",
              borderRadius: 10,
              background: agreementScrollComplete ? "#DCFCE7" : "#FEF3C7",
              border: `1.5px solid ${agreementScrollComplete ? "#16A34A" : "#F59E0B"}`,
              transition: "all 0.3s",
              fontSize: 12, fontWeight: 600,
              color: agreementScrollComplete ? "#14532D" : "#92400E",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>{agreementScrollComplete ? "✓" : "⬇"}</span>
              <span>
                {agreementScrollComplete
                  ? "Document reviewed — complete the acknowledgments below to continue"
                  : "Scroll through the entire agreement to enable the acknowledgments"}
              </span>
            </div>

            {/* ── Agreement document (scrollable content) ─────────────────── */}
            <div style={{
              background: "#fff",
              border: "1.5px solid #E2E8F0",
              borderRadius: 14,
              padding: "20px 18px",
              marginBottom: 14,
              fontSize: 13,
              lineHeight: 1.65,
              color: "#0F172A",
            }}>
              {/* Title + version */}
              <div style={{ borderBottom: "1px solid #E2E8F0", paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.01em" }}>
                  {AGREEMENT_PREAMBLE.title}
                </div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4, letterSpacing: "0.05em" }}>
                  Version {AGREEMENT_VERSION}
                </div>
              </div>

              {/* About */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  About This Agreement
                </div>
                {AGREEMENT_PREAMBLE.about.map((p, i) => (
                  <p key={i} style={{ margin: "0 0 10px", color: "#475569" }}>{p}</p>
                ))}
              </div>

              {/* All 13 sections */}
              {AGREEMENT_SECTIONS.map(section => (
                <div key={section.number} style={{ marginBottom: 22 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 800, color: "#0C4A6E",
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    marginBottom: 10, paddingBottom: 6,
                    borderBottom: "1px solid #F1F5F9",
                  }}>
                    Section {section.number} — {section.title}
                  </div>
                  {section.intro && (
                    <p style={{ margin: "0 0 10px", color: "#475569" }}>{section.intro}</p>
                  )}
                  {section.clauses.map(clause => (
                    <div key={clause.id} style={{ marginBottom: 12 }}>
                      <div style={{ color: "#475569" }}>
                        <span style={{ fontWeight: 700, color: "#0F172A", marginRight: 4 }}>{clause.id}</span>
                        {clause.text}
                      </div>
                      {clause.bullets && (
                        <ul style={{ margin: "6px 0 0 20px", padding: 0, color: "#475569" }}>
                          {clause.bullets.map((b, i) => (
                            <li key={i} style={{ marginBottom: 4 }}>{b}</li>
                          ))}
                        </ul>
                      )}
                      {clause.footer && (
                        <div style={{ marginTop: 6, fontStyle: "italic", color: "#64748B", fontSize: 12 }}>
                          {clause.footer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              {/* ── Bottom marker — observed for scroll-complete detection */}
              <div
                ref={agreementBottomRef}
                style={{ height: 1, marginTop: 8, marginBottom: 4 }}
                aria-hidden="true"
              />
              <div style={{
                marginTop: 8, padding: "8px 12px",
                background: "#F8FAFC", borderRadius: 8,
                fontSize: 11, color: "#94A3B8",
                textAlign: "center",
                fontStyle: "italic",
              }}>
                — End of Agreement —
              </div>
            </div>

            {/* ── 5 acknowledgment checkboxes ──────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>
                Acknowledgments {!agreementScrollComplete && (
                  <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
                    (scroll through agreement above to enable)
                  </span>
                )}
              </div>
              {AGREEMENT_CHECKBOXES.map(cb => (
                <label
                  key={cb.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 12px", marginBottom: 6,
                    borderRadius: 10,
                    border: `1.5px solid ${agreementChecks[cb.id] ? "#16A34A" : "#E2E8F0"}`,
                    background: agreementChecks[cb.id] ? "rgba(22,163,74,0.04)" : "#fff",
                    cursor: agreementScrollComplete ? "pointer" : "not-allowed",
                    opacity: agreementScrollComplete ? 1 : 0.55,
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={agreementChecks[cb.id]}
                    disabled={!agreementScrollComplete}
                    onChange={() => setAgreementChecks(prev => ({ ...prev, [cb.id]: !prev[cb.id] }))}
                    style={{
                      width: 20, height: 20,
                      accentColor: "#16A34A",
                      cursor: agreementScrollComplete ? "pointer" : "not-allowed",
                      marginTop: 1,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{
                    fontSize: 12, lineHeight: 1.5,
                    fontWeight: 600,
                    color: agreementChecks[cb.id] ? "#14532D" : "#475569",
                  }}>
                    {cb.label}
                  </span>
                </label>
              ))}
            </div>

            {/* ── Signature canvas (separate from waiver signature) ─────────── */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
                Your Signature
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>
                Sign below to execute this Rental Agreement. This is separate from your Liability Waiver signature.
              </div>
              <div style={{ position: "relative" }}>
                <canvas
                  ref={agreementSigCanvasRef}
                  width={440}
                  height={140}
                  style={{
                    border: agreementSignature ? "2px solid #16A34A" : "2px solid #CBD5E1",
                    borderRadius: 12, width: "100%", height: 140,
                    background: "#FAFBFC",
                    cursor: Object.values(agreementChecks).every(Boolean) ? "crosshair" : "not-allowed",
                    touchAction: "none",
                    opacity: Object.values(agreementChecks).every(Boolean) ? 1 : 0.5,
                  }}
                  onPointerDown={(e) => {
                    if (!Object.values(agreementChecks).every(Boolean)) return;
                    const canvas = agreementSigCanvasRef.current;
                    const rect = canvas.getBoundingClientRect();
                    const ctx = canvas.getContext("2d");
                    ctx.beginPath();
                    ctx.moveTo(
                      (e.clientX - rect.left) * (canvas.width / rect.width),
                      (e.clientY - rect.top) * (canvas.height / rect.height)
                    );
                    setIsDrawingAgreement(true);
                    canvas.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!isDrawingAgreement) return;
                    const canvas = agreementSigCanvasRef.current;
                    const rect = canvas.getBoundingClientRect();
                    const ctx = canvas.getContext("2d");
                    ctx.strokeStyle = "#0F172A";
                    ctx.lineWidth = 2.5;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    ctx.lineTo(
                      (e.clientX - rect.left) * (canvas.width / rect.width),
                      (e.clientY - rect.top) * (canvas.height / rect.height)
                    );
                    ctx.stroke();
                  }}
                  onPointerUp={() => {
                    setIsDrawingAgreement(false);
                    if (agreementSigCanvasRef.current) {
                      setAgreementSignature(agreementSigCanvasRef.current.toDataURL());
                    }
                  }}
                />
                {!agreementSignature && (
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)",
                    fontSize: 13, color: "#CBD5E1", fontWeight: 500,
                    pointerEvents: "none",
                  }}>
                    {Object.values(agreementChecks).every(Boolean) ? "Sign here" : "Check all boxes above to enable"}
                  </div>
                )}
              </div>
              {agreementSignature && (
                <button
                  onClick={() => {
                    const canvas = agreementSigCanvasRef.current;
                    const ctx = canvas.getContext("2d");
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    setAgreementSignature(null);
                  }}
                  style={{
                    marginTop: 8, background: "none", border: "none",
                    color: "#EF4444", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", padding: "4px 0",
                  }}
                >
                  Clear signature
                </button>
              )}
            </div>

            {/* ── Footer: signing context ──────────────────────────────────── */}
            <div style={{
              marginTop: 16, padding: 14, background: "#F0F9FF",
              borderRadius: 12, border: "1px solid #DBEAFE",
            }}>
              <div style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.5 }}>
                <strong>Signed by:</strong> {info.name} · {info.email}<br/>
                <strong>Agreement version:</strong> {AGREEMENT_VERSION}<br/>
                <strong>Date:</strong> {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}<br/>
                <strong>Timestamp</strong> will be recorded with this agreement.
              </div>
            </div>
          </div>
        )}

        {step === 6 && !done && (
          <div>
            <h2 style={secTitle}>Review & Book</h2>
            <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 16, position: "relative" }}>
              <img src={IMAGES[pkg.heroImg]} alt={pkg.name} style={{
                width: "100%", height: 140, objectFit: "contain",
                background: pkg.id === "spark-duo" ? "#111827" : "#1a1a2e",
              }} />
              <div style={{ position: "absolute", bottom: 10, left: 14 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{pkg.name}</div>
              </div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden" }}>
              {[
                { label: "Location", value: `${loc?.emoji} ${loc?.name}`, sub: whiteGlove ? "🤝 White glove delivery included" : isLakePowell ? "🦠 Decon performed at return" : loc?.drive + " from SLC" },
                { label: "Dates", value: `${formatDate(dates[0])}${dates.length === 2 ? ` → ${formatDate(dates[1])}` : ""}`, sub: `${days} day${days > 1 ? "s" : ""} · Pickup ${formatTime12h(pickupTime)} · Return ${formatTime12h(returnTime)}` },
                { label: "Renter", value: info.name, sub: `${info.email} · ${info.phone} · ${info.experience}` },
                { label: "Life Vests", value: effectiveVestSummary, sub: totalVests === 0 ? "Default selection — we'll bring 2 Adult Mediums" : `${totalVests} rider${totalVests === 1 ? "" : "s"} total` },
              ].map((row, i) => (
                <div key={i} style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{row.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{row.value}</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{row.sub}</div>
                </div>
              ))}
              <div style={{ padding: "16px 18px", background: "#F8FAFC" }}>
                {[
                  { l: `Rental (${days} day${days > 1 ? "s" : ""})`, v: `$${basePrice.toLocaleString()}` },
                  ...(holidayInfo.holidays.map(h => ({ l: `🎆 ${h.name} surcharge`, v: `+$${h.premium}/day`, color: "#DC2626" }))),
                  ...(whiteGlove && whiteGloveFee > 0 ? [{ l: `🤝 White glove — ${loc.name}`, v: `+$${whiteGloveFee}`, color: "#16A34A" }] : []),
                  ...(deconFee > 0 ? [{ l: "🦠 Lake Powell decontamination", v: `+$${deconFee}`, color: "#D97706" }] : []),
                  ...(extraVestFee > 0 ? [{ l: `🪖 Spare vest${spareVestCount === 1 ? "" : "s"} (${spareVestCount} × $${EXTRA_VEST_FEE})`, v: `+$${extraVestFee}`, color: "#D97706" }] : []),
                  ...(loyaltyDiscount > 0 ? [{ l: "✨ Returning customer (10% off)", v: `-$${loyaltyDiscount}`, color: "#16A34A" }] : []),
                  ...(promoAdjustment < 0 ? [{ l: `🏷️ ${promoReason || "Promo"}`, v: `-$${Math.abs(promoAdjustment)}`, color: "#16A34A" }] : []),
                  ...(promoAdjustment > 0 ? [{ l: `📈 ${promoReason || "Surcharge"}`, v: `+$${promoAdjustment}`, color: "#DC2626" }] : []),
                  { l: "Total due now", v: `$${totalPrice.toLocaleString()}`, bold: true },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: r.bold ? 14 : 13, fontWeight: r.bold ? 700 : 400, color: r.color || (r.bold ? "#0F172A" : "#64748B") }}>
                    <span>{r.l}</span><span style={{ fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ borderTop: "2px solid #CBD5E1", paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Pay now (full rental)</span>
                  <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
                    ${totalPrice.toLocaleString()}
                  </span>
                </div>
                <div style={{ marginTop: 12, padding: 12, background: "#FEF3C7", borderRadius: 10, border: "1px solid #FCD34D" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>🔐 At Pickup: ${(pkg?.deposit || 1000).toLocaleString()} Security Deposit</div>
                  <div style={{ fontSize: 11, color: "#92400E", lineHeight: 1.5 }}>
                    A ${(pkg?.deposit || 1000).toLocaleString()} security deposit will be held at pickup via card hold or accepted in cash. Released in full upon satisfactory return of the watercraft.
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "#94A3B8", textAlign: "center", lineHeight: 1.6 }}>
              By booking you agree to our rental terms. View our <a href="/cancellation-policy" style={{ color: "#0EA5E9", textDecoration: "none" }}>cancellation & weather policy</a>.
            </div>
            {payError && (
              <div style={{ marginTop: 12, padding: 12, background: "#FEE2E2", borderRadius: 10, fontSize: 13, color: "#991B1B", textAlign: "center" }}>
                {payError}
              </div>
            )}
          </div>
        )}

        {done && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🌊</div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 700, margin: 0 }}>Booking Confirmed!</h2>
            <p style={{ fontSize: 14, color: "#64748B", marginTop: 10, lineHeight: 1.6 }}>
              Check <strong>{info.email}</strong> for your confirmation and waiver link.
            </p>
            <div style={{ marginTop: 24, background: "#F8FAFC", borderRadius: 14, padding: 20, textAlign: "left" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Next Steps</div>
              {[
                "Sign the digital waiver (link in your email)",
                whiteGlove ? "We'll deliver to the lake — just show up and ride!" : `Arrive at Farmington pickup by ${formatTime12h(pickupTime)}`,
                `Bring valid ID and a credit card OR $${(pkg?.deposit || 1000).toLocaleString()} cash for security deposit`,
                `Security deposit ($${(pkg?.deposit || 1000).toLocaleString()}) will be held at pickup and released on safe return`,
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", background: "#0C4A6E",
                    color: "#fff", fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>{i + 1}</div>
                  <span style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, paddingTop: 2 }}>{s}</span>
                </div>
              ))}
            </div>
            <button onClick={() => { setStep(-1); setPkg(null); setLoc(null); setDates([]); setInfo({ name:"", email:"", phone:"", experience:"", smsOptIn: false, dob:"" }); setWaiverChecks({risks: false, release: false, indemnify: false, rules: false, damage: false, noInsurance: false, ais: false, noLakePowell: false}); setSignature(null); setAgreementChecks(initialAgreementChecks); setAgreementSignature(null); setAgreementScrollComplete(false); setDone(false); setWhiteGlove(false); setIsRepeatCustomer(false); setVestSizes(EMPTY_VESTS); setPickupTime("08:00"); setReturnTime("20:00"); }}
              style={{ ...btnPrimary, marginTop: 20, background: "#fff", color: "#0C4A6E", border: "2px solid #0C4A6E", boxShadow: "none" }}>
              Book Another Rental
            </button>
          </div>
        )}

        {!done && (
          <div style={{ display: "flex", gap: 10, marginTop: 24, position: "sticky", bottom: 16, zIndex: 10 }}>
            <button
              onClick={() => step === 6 ? handleCheckout() : setStep(step + 1)}
              disabled={!canNext() || paying}
              style={{
                ...btnPrimary, flex: 1,
                opacity: (canNext() && !paying) ? 1 : 0.35,
                cursor: (canNext() && !paying) ? "pointer" : "not-allowed",
                background: step === 6 ? "linear-gradient(135deg, #16A34A, #15803D)" : "linear-gradient(135deg, #0EA5E9, #0284C7)",
                boxShadow: step === 6 ? "0 4px 20px rgba(22,163,74,0.3)" : "0 4px 20px rgba(14,165,233,0.25)",
              }}>
              {step === 6
                ? (paying ? "Redirecting to Stripe..." : `Pay $${totalPrice.toLocaleString()} →`)
                : step === 5
                  ? "I Agree — Continue →"
                  : step === 4
                    ? "I Agree — Continue →"
                    : "Continue →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const secTitle = {
  fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 700,
  margin: "0 0 20px", letterSpacing: "-0.02em",
};
const labelSt = {
  fontSize: 11, fontWeight: 600, color: "#64748B",
  marginBottom: 6, display: "block", letterSpacing: "0.03em",
};
const inputSt = {
  width: "100%", padding: "14px 16px", borderRadius: 10,
  border: "2px solid #E2E8F0", fontSize: 14, color: "#0F172A",
  background: "#fff", outline: "none", boxSizing: "border-box",
  fontFamily: "'Outfit', sans-serif",
};
const btnPrimary = {
  padding: "16px 24px", borderRadius: 14, border: "none",
  color: "#fff", fontSize: 15, fontWeight: 700,
  fontFamily: "'Outfit', sans-serif", cursor: "pointer",
  letterSpacing: "-0.01em",
};
