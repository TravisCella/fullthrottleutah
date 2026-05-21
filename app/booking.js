import { useState, useEffect, useRef } from "react";

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
  rzrHero: "/images/rzr-hero.jpg",
  rzrSide: "/images/rzr-side.jpg",
  rzrInterior: "/images/rzr-interior.jpg",
  rzrAction: "/images/rzr-action.jpg",
};

const PACKAGES = [
  {
    id: "spark-duo",
    name: "Spark Duo",
    type: "pwc",
    tagline: "2 × 2014 Sea-Doo Spark 900 ACE HO",
    description: "Two nimble, lightweight Sparks on a single trailer. Quick, fun, and easy to ride — perfect for cruising any Utah reservoir.",
    includes: ["2 Sea-Doo Spark 900 ACE HO", "Single trailer", "4 life preservers", "2 anchoring systems", "Safety flags"],
    weekday: 375,
    weekend: 425,
    multiDay: { 2: 340, 3: 310, 4: 275, 6: 240 },
    deposit: 1000,
    heroImg: "sparkHero",
    galleryImgs: ["sparkFront", "sparkSide", "sparkAngle"],
    accent: "#0EA5E9",
    accentLight: "rgba(14,165,233,0.08)",
  },
  {
    id: "gtx-duo",
    name: "GTX Limited Duo",
    type: "pwc",
    tagline: "2 × 2026 Sea-Doo GTX Limited 325",
    description: "The ultimate luxury ride. 325 HP, 10.25\" touchscreen, premium Bluetooth audio, massive swim platform. This is first class on the water.",
    includes: ["2 Sea-Doo GTX Limited 325 HP", "Single trailer", "4 life preservers", "2 anchoring systems", "Safety flags", "Bluetooth audio"],
    weekday: 625,
    weekend: 695,
    multiDay: { 2: 595, 3: 565, 4: 525, 6: 485 },
    deposit: 1000,
    heroImg: "gtxHero",
    galleryImgs: ["gtxStudio", "gtxWater", "gtxAction"],
    accent: "#B8860B",
    accentLight: "rgba(184,134,11,0.08)",
  },
  {
    id: "rzr-premium",
    name: "RZR Premium 4-Seater",
    type: "utv",
    tagline: "2017 Polaris RZR EPS 1000 — Premium Equipped",
    description: "Premium 4-seater UTV loaded with upgrades. Harman Kardon Stage 5 audio, full doors, windshield, aftermarket tires, roof rack, toolbox. Hauled on a double-axle trailer.",
    includes: ["2017 Polaris RZR EPS 1000 4-seater", "Big Bubba double-axle trailer", "Harman Kardon Stage 5 audio", "Full doors + windshield", "Aftermarket tires", "Roof rack + toolbox", "4 helmets"],
    weekday: 425,
    weekend: 495,
    multiDay: { 2: 395, 3: 365, 4: 325, 6: 295 },
    deposit: 1500,
    heroImg: "rzrHero",
    galleryImgs: ["rzrSide", "rzrInterior", "rzrAction"],
    accent: "#EA580C",
    accentLight: "rgba(234,88,12,0.08)",
  },
];

const LOCATIONS_PWC = [
  { id: "pineview", name: "Pineview Reservoir", region: "Ogden Valley", drive: "~1hr", emoji: "🏔️" },
  { id: "jordanelle", name: "Jordanelle Reservoir", region: "Wasatch Back", drive: "~45min", emoji: "🌲" },
  { id: "deer-creek", name: "Deer Creek Reservoir", region: "Heber Valley", drive: "~50min", emoji: "🦌" },
  { id: "bear-lake", name: "Bear Lake", region: "Utah/Idaho Border", drive: "~2.5hr", emoji: "💎" },
  { id: "lake-powell", name: "Lake Powell", region: "Southern Utah", drive: "~4.5hr", emoji: "🏜️" },
];

const LOCATIONS_UTV = [
  { id: "moab", name: "Moab Trail System", region: "Southeast Utah", drive: "~4hr", emoji: "🪨" },
  { id: "sand-hollow", name: "Sand Hollow State Park", region: "Southwest Utah", drive: "~4.5hr", emoji: "🏜️" },
  { id: "american-fork", name: "American Fork Canyon", region: "Wasatch Front", drive: "~45min", emoji: "🌲" },
  { id: "wasatch", name: "Wasatch Mountain Trails", region: "Heber Valley", drive: "~1hr", emoji: "⛰️" },
  { id: "five-mile", name: "Five Mile Pass / Cedar Fort", region: "West Desert", drive: "~1hr", emoji: "🏞️" },
  { id: "knolls", name: "Knolls Recreation Area", region: "West Desert", drive: "~1.5hr", emoji: "🏝️" },
];

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }
function isWeekend(d) { const day = new Date(d).getDay(); return day === 0 || day === 5 || day === 6; }
function formatDate(d) { return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); }
function daysBetween(a, b) { return Math.round((b - a) / 864e5) + 1; }

// Find any premium that applies to a given date. Returns null if no premium applies.
function getPremiumForDate(date, premiums) {
  if (!premiums || premiums.length === 0) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  for (const p of premiums) {
    const start = new Date(p.start); start.setHours(0, 0, 0, 0);
    const end = new Date(p.end || p.start); end.setHours(0, 0, 0, 0);
    if (d >= start && d <= end) return p;
  }
  return null;
}

// Apply a premium (if any) to a base rate. Multiplier and flatAdd are combined.
function applyPremium(baseRate, premium) {
  if (!premium) return baseRate;
  const multiplier = premium.multiplier || 1;
  const flatAdd = premium.flatAdd || 0;
  return Math.round(baseRate * multiplier + flatAdd);
}

// Compute the price for a specific day, factoring in:
// - Whether it's weekday vs weekend
// - Multi-day base rate (depends on TOTAL trip length)
// - Any holiday/event premium applied to that specific date
function priceForDay(date, totalDays, pkg, premiums) {
  let base;
  if (totalDays === 1) {
    base = isWeekend(date) ? pkg.weekend : pkg.weekday;
  } else if (totalDays >= 6) {
    base = pkg.multiDay[6];
  } else if (totalDays >= 4) {
    base = pkg.multiDay[4];
  } else if (totalDays >= 3) {
    base = pkg.multiDay[3];
  } else {
    base = pkg.multiDay[2];
  }
  const premium = getPremiumForDate(date, premiums);
  return applyPremium(base, premium);
}

function calculatePrice(pkg, start, end, premiums = []) {
  const days = daysBetween(start, end);
  // Walk each day of the trip and sum the day rates (with premiums applied per-day)
  let total = 0;
  const startMs = new Date(start).getTime();
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * 864e5);
    total += priceForDay(d, days, pkg, premiums);
  }
  return total;
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

function Calendar({ selectedDates, onSelectDate, month, year, onChangeMonth, bookedDates, pkg, premiumDates }) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date(); today.setHours(0,0,0,0);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isBooked = (day) => {
    if (!day || !bookedDates?.length) return false;
    const date = new Date(year, month, day);
    return bookedDates.some(b => {
      const start = new Date(b.start);
      const end = new Date(b.end || b.start);
      start.setHours(0,0,0,0);
      end.setHours(0,0,0,0);
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

  // Day rate with premium applied if any premium matches
  const dayRate = (day) => {
    if (!day || !pkg) return { rate: null, hasPremium: false };
    const date = new Date(year, month, day);
    const base = isWeekend(date) ? pkg.weekend : pkg.weekday;
    const premium = getPremiumForDate(date, premiumDates);
    if (premium) {
      return { rate: applyPremium(base, premium), hasPremium: true };
    }
    return { rate: base, hasPremium: false };
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
          const unavailable = past || booked;
          const { rate, hasPremium } = dayRate(day);
          const showPrice = day && !past && !booked && rate;
          // Color: selected = white; booked = red; premium = bold red; weekend = orange; weekday = gray
          const priceColor = sel
            ? "rgba(255,255,255,0.95)"
            : hasPremium ? "#DC2626"
            : wknd ? "#D97706"
            : "#94A3B8";
          const dateColor = !day ? "transparent"
            : booked ? "#EF4444"
            : past ? "#D1D5DB"
            : sel ? "#fff"
            : hasPremium ? "#DC2626"
            : wknd ? "#D97706"
            : "#1E293B";
          return (
            <div key={i} onClick={() => day && !unavailable && onSelectDate(new Date(year, month, day))}
              style={{
                padding: "6px 0 5px", minHeight: 52, position: "relative",
                cursor: day && !unavailable ? "pointer" : "default",
                color: dateColor,
                background: sel ? (start || end ? "#0C4A6E" : "rgba(12,74,110,0.12)") : booked ? "rgba(239,68,68,0.06)" : "transparent",
                borderRadius: start && end ? 8 : start ? "8px 0 0 8px" : end ? "0 8px 8px 0" : sel ? 0 : 8,
                transition: "all 0.15s",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
              }}>
              {hasPremium && !booked && !past && (
                <div style={{
                  position: "absolute", top: 2, right: 4, fontSize: 8, lineHeight: 1,
                  color: sel ? "rgba(255,255,255,0.9)" : "#DC2626",
                }}>★</div>
              )}
              <div style={{
                fontSize: 14, fontWeight: sel ? 700 : (hasPremium ? 600 : 500), lineHeight: 1,
                textDecoration: booked ? "line-through" : "none",
              }}>
                {day || ""}
              </div>
              {showPrice && (
                <div style={{
                  fontSize: 10, fontWeight: hasPremium ? 700 : 600,
                  color: priceColor,
                  letterSpacing: "-0.02em", lineHeight: 1,
                }}>
                  ${rate}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
  const [info, setInfo] = useState({ name: "", email: "", phone: "", experience: "" });
  const [smsConsent, setSmsConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);
  const [fadeIn, setFadeIn] = useState(true);
  const [waiverChecks, setWaiverChecks] = useState({risks: false, release: false, indemnify: false, rules: false, damage: false, fuel: false, noInsurance: false});
  const [signature, setSignature] = useState(null);
  const sigCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [bookedDates, setBookedDates] = useState([]);
  const [premiumDates, setPremiumDates] = useState([]);

  useEffect(() => { setFadeIn(false); const t = setTimeout(() => setFadeIn(true), 20); return () => clearTimeout(t); }, [step]);

  // Fetch booked dates and premium dates when package is selected
  useEffect(() => {
    if (pkg) {
      fetch(`/api/bookings?package=${encodeURIComponent(pkg.name)}`)
        .then(r => r.json())
        .then(data => {
          setBookedDates(data.bookedDates || []);
          setPremiumDates(data.premiumDates || []);
        })
        .catch(() => {
          setBookedDates([]);
          setPremiumDates([]);
        });
    }
  }, [pkg]);

  const handleDate = (d) => {
    if (dates.length === 0 || dates.length === 2) setDates([d]);
    else if (d < dates[0]) setDates([d]);
    else setDates([dates[0], d]);
  };
  const changeMo = (dir) => {
    let m = mo + dir, y = yr;
    if (m > 11) { m = 0; y++; } if (m < 0) { m = 11; y--; }
    setMo(m); setYr(y);
  };

  const handleCheckout = async () => {
    setPaying(true);
    setPayError(null);
    try {
      const depositAmt = Math.round(price / 2);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageName: pkg.name,
          packageTagline: pkg.tagline,
          totalPrice: price,
          depositAmount: depositAmt,
          days: days,
          startDate: formatDate(dates[0]),
          endDate: dates.length === 2 ? formatDate(dates[1]) : formatDate(dates[0]),
          location: loc.name,
          renterName: info.name,
          renterEmail: info.email,
          renterPhone: info.phone,
          experience: info.experience,
          waiverSigned: 'true',
          waiverDate: new Date().toISOString(),
          smsConsent: smsConsent,
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
  const price = pkg && days > 0 ? calculatePrice(pkg, dates[0], dates.length === 2 ? dates[1] : dates[0], premiumDates) : 0;

  const canNext = () => {
    if (step === 0) return pkg;
    if (step === 1) return loc;
    if (step === 2) return dates.length >= 1;
    if (step === 3) return info.name && info.email && info.phone && info.experience;
    if (step === 4) return Object.values(waiverChecks).every(Boolean) && signature;
    if (step === 5) return true;
    return false;
  };

  const stepLabels = ["Package", "Location", "Dates", "Info", "Waiver", "Confirm"];

  // LANDING PAGE
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
              {[...LOCATIONS_PWC, ...LOCATIONS_UTV].map(l => (
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
              <span style={{ color: "#64748B" }}>© {new Date().getFullYear()} TW Assets LLC d/b/a Full Throttle Utah</span>
            </div>
            <div style={{ marginTop: 12, fontSize: 11 }}>
              <a href="/privacy-policy" style={{ color: "#64748B", textDecoration: "underline", marginRight: 16 }}>Privacy Policy</a>
              <a href="/terms" style={{ color: "#64748B", textDecoration: "underline" }}>Terms & Conditions</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // BOOKING FLOW
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
            <h2 style={secTitle}>{pkg?.type === "utv" ? "Pick Your Trail" : "Pick Your Lake"}</h2>
            {(pkg?.type === "utv" ? LOCATIONS_UTV : LOCATIONS_PWC).map(l => (
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
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{l.region}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{l.drive}</div>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: 14, background: "#F0F9FF", borderRadius: 12, border: "1px solid #DBEAFE" }}>
              <div style={{ fontSize: 12, color: "#1E40AF", lineHeight: 1.5 }}>
                <strong>Pickup:</strong> Farmington, UT — you tow to the {pkg?.type === "utv" ? "trailhead" : "lake"} with your own vehicle. 2" ball hitch and flat 4-prong light hookup required.
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
            {days > 0 && (
              <div style={{
                marginTop: 14, background: "#0C4A6E", borderRadius: 14, padding: "16px 18px",
                display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.8 }}>{days} day{days > 1 ? "s" : ""}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {formatDate(dates[0])}{dates.length === 2 ? ` → ${formatDate(dates[1])}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>${price.toLocaleString()}</div>
                  {days > 1 && <div style={{ fontSize: 11, opacity: 0.6 }}>${Math.round(price/days)}/day avg</div>}
                </div>
              </div>
            )}
            <div style={{ marginTop: 10, padding: "10px 12px", background: "#F8FAFC", borderRadius: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, color: "#64748B", textAlign: "center" }}>
                <span style={{ color: "#1E293B", fontWeight: 600 }}>${pkg?.weekday}</span> weekday · <span style={{ color: "#D97706", fontWeight: 600 }}>${pkg?.weekend}</span> weekend · Multi-day discounts apply automatically
              </div>
              {premiumDates.length > 0 && (
                <div style={{ fontSize: 10, color: "#DC2626", textAlign: "center", fontWeight: 500 }}>
                  ★ = Holiday/premium pricing
                </div>
              )}
              <div style={{ fontSize: 10, color: "#94A3B8", textAlign: "center" }}>
                Tap start → end for multi-day rentals
              </div>
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
                  style={inputSt}
                />
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label style={labelSt}>{pkg?.type === "utv" ? "UTV / Off-Road Experience" : "Jet Ski Experience"}</label>
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
            <div style={{
              marginTop: 8,
              padding: 14,
              borderRadius: 12,
              border: smsConsent ? "2px solid #0C4A6E" : "2px solid #E2E8F0",
              background: smsConsent ? "#F0F9FF" : "#fff",
              cursor: "pointer",
              transition: "all 0.15s",
            }} onClick={() => setSmsConsent(!smsConsent)}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{
                  flexShrink: 0,
                  width: 22, height: 22, borderRadius: 6,
                  border: smsConsent ? "2px solid #0C4A6E" : "2px solid #CBD5E1",
                  background: smsConsent ? "#0C4A6E" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginTop: 1,
                }}>
                  {smsConsent && <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.55 }}>
                  <div style={{ marginBottom: 4 }}>
                    <strong style={{ color: "#0F172A" }}>Send me SMS notifications</strong>
                    <span style={{ color: "#94A3B8", marginLeft: 6, fontSize: 11, fontWeight: 600 }}>(OPTIONAL)</span>
                  </div>
                  I agree to receive SMS notifications from Full Throttle Utah about my reservation (booking confirmation, pickup/return reminders, and follow-up). Message frequency varies. Msg & data rates may apply. Reply STOP to opt out. <strong>Consent is not required to complete your booking</strong> — you'll still receive email confirmations.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: "#64748B", lineHeight: 1.5, padding: "0 4px" }}>
              By continuing, you agree to our{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#0C4A6E", textDecoration: "underline" }}>Terms & Conditions</a>
              {" "}and{" "}
              <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: "#0C4A6E", textDecoration: "underline" }}>Privacy Policy</a>.
            </div>

            <div style={{ marginTop: 14, background: "#FEF3C7", borderRadius: 12, padding: 14, display: "flex", gap: 10 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
                <strong>Digital waiver next.</strong> You'll review and sign the rental waiver in the next step. Additional riders must also sign at pickup.
              </div>
            </div>
          </div>
        )}


        {/* ── STEP 4: WAIVER ── */}
        {step === 4 && !done && (
          <div>
            <h2 style={secTitle}>Liability Waiver</h2>
            <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 16 }}>
              Please read each section carefully and check each box to acknowledge you understand and agree.
            </div>

            {(pkg?.type === "utv" ? [
              { key: "risks", title: "Acknowledgment of Risks",
                text: "I understand that operating a UTV/side-by-side off-road vehicle involves serious risks including rollover, collision, ejection, mechanical failure, terrain hazards, dust inhalation, and injuries from rocks, debris, and other vehicles. These risks can result in bodily injury, permanent disability, or death. I acknowledge that off-road driving carries greater inherent risk than on-road driving." },
              { key: "release", title: "Waiver & Release of Liability",
                text: "To the fullest extent permitted by Utah law, I forever release, waive, and discharge TW Assets LLC, its members, managers, employees, and agents from any and all liability, claims, damages, and costs arising from the rental and use of the UTV and equipment, including claims arising from the negligence of TW Assets LLC. This release does not apply to willful misconduct or gross negligence." },
              { key: "indemnify", title: "Indemnification",
                text: "I agree to indemnify, defend, and hold harmless TW Assets LLC from any claims, damages, or expenses brought by any person arising from my rental, use, or transport of the UTV and equipment." },
              { key: "rules", title: "Renter Obligations",
                text: "I confirm that: I am at least 25 years old with a valid driver's license. All operators must be 18+ with valid driver's license. All occupants will wear seatbelts and DOT-approved helmets at all times. I will not operate under the influence of alcohol or drugs. I will stay on designated trails and obey all posted speed limits and signs. I have inspected the equipment and accept it in safe working condition. I will comply with all applicable OHV laws and Utah State Parks regulations." },
              { key: "damage", title: "Damage & Security Deposit",
                text: "I accept financial responsibility for all damage to, loss of, or theft of the UTV and equipment during the rental period, regardless of fault. A $1,500 security deposit will be collected and refunded upon satisfactory return. Damage from rollovers, suspension stress, frame damage, clutch wear from improper use, and aftermarket component damage (tires, audio, doors, windshield) is renter's responsibility." },
              { key: "fuel", title: "Fuel Policy",
                text: "I understand that I am responsible for fueling the UTV and must return it with a FULL tank of 91-octane gasoline. If returned with less than a full tank, or fueled with anything other than 91-octane gasoline, I authorize Full Throttle Utah to deduct the actual refueling cost plus a 20% service premium from my security deposit." },
              { key: "noInsurance", title: "No Insurance Provided",
                text: "I understand that TW Assets LLC does not provide collision, liability, or personal injury insurance for renters, passengers, or third parties. I assume all financial risk for any uninsured loss. UTVs are typically not covered by standard auto policies — I am responsible for understanding my own coverage." },
            ] : [
              { key: "risks", title: "Acknowledgment of Risks",
                text: "I understand that operating a personal watercraft involves serious risks including collision, capsizing, drowning, equipment malfunction, and injuries from jet propulsion systems. These risks can result in bodily injury, permanent disability, or death." },
              { key: "release", title: "Waiver & Release of Liability",
                text: "To the fullest extent permitted by Utah law, I forever release, waive, and discharge TW Assets LLC, its members, managers, employees, and agents from any and all liability, claims, damages, and costs arising from the rental and use of the PWC and equipment, including claims arising from the negligence of TW Assets LLC. This release does not apply to willful misconduct or gross negligence." },
              { key: "indemnify", title: "Indemnification",
                text: "I agree to indemnify, defend, and hold harmless TW Assets LLC from any claims, damages, or expenses brought by any person arising from my rental, use, or transport of the PWC and equipment." },
              { key: "rules", title: "Renter Obligations",
                text: "I confirm that: I am at least 18 years old with valid ID. All operators will be 16+ per Utah Code §73-18-15.1. All riders will wear USCG-approved life vests at all times. I will not operate under the influence of alcohol or drugs. I have inspected the equipment and accept it in safe working condition. I will comply with all applicable boating laws." },
              { key: "damage", title: "Damage & Security Deposit",
                text: "I accept financial responsibility for all damage to, loss of, or theft of the PWC and equipment during the rental period, regardless of fault. A $1,000 security deposit will be collected and refunded upon satisfactory return." },
              { key: "fuel", title: "Fuel Policy",
                text: "I understand that I am responsible for fueling the watercraft and must return all equipment with a FULL tank of 91-octane gasoline. If equipment is returned with less than a full tank, or fueled with anything other than 91-octane gasoline, I authorize Full Throttle Utah to deduct the actual refueling cost plus a 20% service premium from my security deposit." },
              { key: "noInsurance", title: "No Insurance Provided",
                text: "I understand that TW Assets LLC does not provide collision, liability, or personal injury insurance for renters, passengers, or third parties. I assume all financial risk for any uninsured loss." },
            ]).map(section => (
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

            {/* Signature Pad */}
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

        {step === 5 && !done && (
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
                { label: "Location", value: `${loc?.emoji} ${loc?.name}`, sub: loc?.drive + " from SLC" },
                { label: "Dates", value: `${formatDate(dates[0])}${dates.length === 2 ? ` → ${formatDate(dates[1])}` : ""}`, sub: `${days} day${days > 1 ? "s" : ""} · Pickup 8AM · Return 8PM` },
                { label: "Renter", value: info.name, sub: `${info.email} · ${info.phone} · ${info.experience}` },
              ].map((row, i) => (
                <div key={i} style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{row.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{row.value}</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{row.sub}</div>
                </div>
              ))}
              <div style={{ padding: "16px 18px", background: "#F8FAFC" }}>
                {[
                  { l: `Rental (${days} day${days > 1 ? "s" : ""})`, v: `$${price.toLocaleString()}` },
                  { l: "Security deposit (refundable)", v: `$${pkg.deposit.toLocaleString()}` },
                  { l: "Due today (50% booking deposit)", v: `$${Math.round(price / 2).toLocaleString()}`, bold: true },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: r.bold ? 14 : 13, fontWeight: r.bold ? 700 : 400, color: r.bold ? "#0F172A" : "#64748B" }}>
                    <span>{r.l}</span><span style={{ fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ borderTop: "2px solid #CBD5E1", paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>Due at pickup</span>
                  <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
                    ${(Math.round(price / 2) + pkg.deposit).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "#94A3B8", textAlign: "center", lineHeight: 1.6 }}>
              By booking you agree to our rental terms. Cancellations 72+ hours out receive a full deposit refund.
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
              Confirmation sent to <strong>{info.email}</strong> and a text to your phone.
            </p>
            <div style={{ marginTop: 24, background: "#F8FAFC", borderRadius: 14, padding: 20, textAlign: "left" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Next Steps</div>
              {[
                "Arrive at Farmington pickup by 8:00 AM",
                "Bring valid ID, proof of insurance, 2\" ball hitch",
                `Pay remaining $${(Math.round(price/2) + pkg.deposit).toLocaleString()} at pickup`,
                "Return with FULL tank of 91-octane gas (+20% premium if not full)",
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
            <button onClick={() => { setStep(-1); setPkg(null); setLoc(null); setDates([]); setInfo({ name:"", email:"", phone:"", experience:"" }); setSmsConsent(false); setWaiverChecks({risks: false, release: false, indemnify: false, rules: false, damage: false, fuel: false, noInsurance: false}); setSignature(null); setDone(false); }}
              style={{ ...btnPrimary, marginTop: 20, background: "#fff", color: "#0C4A6E", border: "2px solid #0C4A6E", boxShadow: "none" }}>
              Book Another Rental
            </button>
          </div>
        )}

        {!done && (
          <div style={{ display: "flex", gap: 10, marginTop: 24, position: "sticky", bottom: 16, zIndex: 10 }}>
            <button
              onClick={() => step === 5 ? handleCheckout() : setStep(step + 1)}
              disabled={!canNext() || paying}
              style={{
                ...btnPrimary, flex: 1,
                opacity: (canNext() && !paying) ? 1 : 0.35,
                cursor: (canNext() && !paying) ? "pointer" : "not-allowed",
                background: step === 5 ? "linear-gradient(135deg, #16A34A, #15803D)" : "linear-gradient(135deg, #0EA5E9, #0284C7)",
                boxShadow: step === 5 ? "0 4px 20px rgba(22,163,74,0.3)" : "0 4px 20px rgba(14,165,233,0.25)",
              }}>
              {step === 5 ? (paying ? "Redirecting to Stripe..." : `Pay $${Math.round(price / 2).toLocaleString()} Deposit →`) : step === 4 ? "I Agree — Continue →" : "Continue →"}
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
  border: "2px solid #E2E8F0", fontSize: 16, color: "#0F172A",
  background: "#fff", outline: "none", boxSizing: "border-box",
  fontFamily: "'Outfit', sans-serif",
};
const btnPrimary = {
  padding: "16px 24px", borderRadius: 14, border: "none",
  color: "#fff", fontSize: 15, fontWeight: 700,
  fontFamily: "'Outfit', sans-serif", cursor: "pointer",
  letterSpacing: "-0.01em",
};
