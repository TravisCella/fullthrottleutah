'use client';

import { useState, useRef, useCallback, useEffect } from "react";

const CUSTOMER_ZONES = [
  { id: "bow", label: "Bow / front", icon: "↗", hint: "Stand in front, capture the full nose and hull" },
  { id: "port", label: "Port side (left)", icon: "←", hint: "Full length from front to back, stand 6ft away" },
  { id: "starboard", label: "Starboard side (right)", icon: "→", hint: "Full length from front to back, stand 6ft away" },
  { id: "stern", label: "Stern / rear", icon: "↙", hint: "Capture jet nozzle, rear bumper, and registration" },
  { id: "deck", label: "Deck / seat area", icon: "⬆", hint: "Show seat condition, storage lids, handlebars" },
  { id: "gauge", label: "Gauge / display", icon: "◉", hint: "Power on and capture the screen clearly" },
  { id: "trailer", label: "Trailer & lights", icon: "▬", hint: "Hitch, bunks, and all trailer lights" },
  { id: "extras", label: "Gear check", icon: "⚓", hint: "Life vests, anchor, safety flag, fuel level" },
];

const OWNER_ZONES = [
  ...CUSTOMER_ZONES,
  { id: "impeller", label: "Impeller inspection", icon: "⚙", hint: "Photograph impeller blades, wear ring, and intake grate. Note any nicks, dents, or debris damage." },
  { id: "hull-underside", label: "Hull underside", icon: "▼", hint: "Check for deep scratches, cracks, or gelcoat damage on the hull bottom" },
];

const MACHINES = [
  { id: "spark-1", name: "Spark #1", subtitle: "2014 Sea-Doo Spark 900 ACE" },
  { id: "spark-2", name: "Spark #2", subtitle: "2014 Sea-Doo Spark 900 ACE" },
  { id: "gtx-1", name: "GTX 325 #1", subtitle: "2026 Sea-Doo GTX Limited 325" },
  { id: "gtx-2", name: "GTX 325 #2", subtitle: "2026 Sea-Doo GTX Limited 325" },
];

const DB_URL = "https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com";

function ts() {
  return new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function compress(dataUrl, cb) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    let w = img.width, h = img.height;
    if (w > 800) { h = Math.round((h * 800) / w); w = 800; }
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    cb(c.toDataURL("image/jpeg", 0.6));
  };
  img.src = dataUrl;
}

function upload(record, cb) {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  fetch(`${DB_URL}/inspections/${id}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...record, id, timestamp: ts() }),
  }).then(() => cb(true, id)).catch(() => cb(false, null));
}

// Notify backend so it can email/SMS the owner AND log to Google Sheets
function notifyBackend(record, inspectionId) {
  const damageNotes = (record.zones || [])
    .filter(z => z.damage && z.damage !== "None" && z.damage.trim() !== "")
    .map(z => `${z.zone}: ${z.damage}`);
  
  return fetch('/api/inspection-submitted', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inspectionId,
      type: record.role, // 'customer' or 'owner'
      timestamp: ts(),
      customerName: record.customerName,
      machineName: record.machineName,
      rentalDate: record.rentalDate,
      photoCount: record.photoCount,
      damageNotes,
      hasDamage: damageNotes.length > 0,
      fuelOk: record.fuelOk,
      hourMeter: record.hourMeter,
      globalNote: record.globalNote,
    }),
  }).catch(err => {
    console.error('Notify backend failed (non-fatal):', err);
    // Inspection is still saved in Firebase even if notification fails
  });
}

function aiCompare(checkoutId, checkinId, cb) {
  Promise.all([
    fetch(`${DB_URL}/inspections/${checkoutId}.json`).then(r => r.json()),
    fetch(`${DB_URL}/inspections/${checkinId}.json`).then(r => r.json()),
  ]).then(([out, inn]) => {
    if (!out || !inn) { cb(null); return; }
    const findings = [];
    const allZones = [...new Set([...Object.keys(out.zones || {}), ...Object.keys(inn.zones || {})])];
    
    for (const zoneIdx of allZones) {
      const outZone = (out.zones || [])[zoneIdx];
      const inZone = (inn.zones || [])[zoneIdx];
      if (!outZone || !inZone) continue;
      
      const outDmg = outZone.damage || "None";
      const inDmg = inZone.damage || "None";
      
      if (inDmg !== "None" && inDmg !== outDmg) {
        findings.push({
          zone: inZone.zone || outZone.zone,
          severity: "damage",
          note: `New damage reported: "${inDmg}" (was: "${outDmg}")`,
        });
      }
    }

    if (inn.fuelOk === false) {
      findings.push({ zone: "Fuel", severity: "fee", note: "Returned not full — refuel fee applies" });
    }

    const impellerZone = (inn.zones || []).find(z => z.zone === "Impeller inspection");
    if (impellerZone && impellerZone.damage && impellerZone.damage !== "None") {
      findings.push({ zone: "Impeller", severity: "critical", note: `Impeller damage: "${impellerZone.damage}"` });
    }

    const hullZone = (inn.zones || []).find(z => z.zone === "Hull underside");
    if (hullZone && hullZone.damage && hullZone.damage !== "None") {
      findings.push({ zone: "Hull underside", severity: "critical", note: `Hull damage: "${hullZone.damage}"` });
    }

    cb({
      checkoutTime: out.timestamp,
      checkinTime: inn.timestamp,
      customer: out.customerName || inn.customerName,
      machine: out.machineName || inn.machineName,
      checkoutPhotos: out.photoCount || 0,
      checkinPhotos: inn.photoCount || 0,
      findings,
      verdict: findings.some(f => f.severity === "critical") ? "CRITICAL" :
               findings.some(f => f.severity === "damage") ? "DAMAGE_FOUND" :
               findings.some(f => f.severity === "fee") ? "FEES_APPLY" : "CLEAR",
    });
  }).catch(() => cb(null));
}

function PhotoBtn({ onCapture, label }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0]; if (!f) return;
          setBusy(true);
          const r = new FileReader();
          r.onload = () => compress(r.result, img => { onCapture(img); setBusy(false); });
          r.readAsDataURL(f); e.target.value = "";
        }}
      />
      <button onClick={() => ref.current?.click()} disabled={busy}
        style={{ width: "100%", padding: "12px 0", border: "1.5px dashed #b0aea6", borderRadius: 10, background: busy ? "#f0ede6" : "transparent", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, color: "#6b6a65", fontFamily: "inherit", opacity: busy ? 0.5 : 1 }}>
        {busy ? "⏳ Processing..." : `📷 ${label}`}
      </button>
    </div>
  );
}

function Thumb({ src, onRemove }) {
  return (
    <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid #e0ddd5" }}>
      <img src={src} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
      <button onClick={onRemove} style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 12, cursor: "pointer", padding: 0, lineHeight: "20px", fontFamily: "inherit" }}>×</button>
    </div>
  );
}

export default function InspectionV2() {
  const [role, setRole] = useState(null);
  const [mode, setMode] = useState(null);
  const [step, setStep] = useState("machine");
  const [machine, setMachine] = useState(null);
  const [photos, setPhotos] = useState({});
  const [notes, setNotes] = useState({});
  const [zone, setZone] = useState(0);
  const [customer, setCustomer] = useState("");
  const [rentalDate, setRentalDate] = useState("");
  const [fuelOk, setFuelOk] = useState(null);
  const [globalNote, setGlobalNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState([]);
  const [compareMode, setCompareMode] = useState(false);
  const [compareOut, setCompareOut] = useState("");
  const [compareIn, setCompareIn] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [impellerNotes, setImpellerNotes] = useState("");
  const [hourMeter, setHourMeter] = useState("");
  
  // NEW: server-loaded recent inspections (replaces local session state)
  const [recentInspections, setRecentInspections] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentSearch, setRecentSearch] = useState("");

  const zones = role === "owner" ? OWNER_ZONES : CUSTOMER_ZONES;
  const mk = machine?.id || "";
  const zp = photos[mk] || {};
  const zn = notes[mk] || {};
  const cz = zones[zone];
  const cp = zp[cz?.id] || [];
  const cn = zn[cz?.id] || "";
  const done = Object.keys(zp).filter(k => (zp[k] || []).length > 0).length;
  
  // Load recent inspections from server when entering home screen or compare mode
  useEffect(() => {
    if (role === null || compareMode) {
      loadRecentInspections();
    }
  }, [role, compareMode]);
  
  function loadRecentInspections() {
    setLoadingRecent(true);
    fetch('/api/recent-inspections?days=30')
      .then(r => r.json())
      .then(data => {
        setRecentInspections(data.inspections || []);
      })
      .catch(() => setRecentInspections([]))
      .finally(() => setLoadingRecent(false));
  }

  const addPhoto = useCallback(img => {
    setPhotos(p => { const m = { ...(p[mk] || {}) }; m[cz.id] = [...(m[cz.id] || []), img]; return { ...p, [mk]: m }; });
  }, [mk, cz]);

  const rmPhoto = useCallback(i => {
    setPhotos(p => { const m = { ...(p[mk] || {}) }; const z = [...(m[cz.id] || [])]; z.splice(i, 1); m[cz.id] = z; return { ...p, [mk]: m }; });
  }, [mk, cz]);

  const setZoneNote = useCallback(v => {
    setNotes(p => { const m = { ...(p[mk] || {}) }; m[cz.id] = v; return { ...p, [mk]: m }; });
  }, [mk, cz]);

  const handleSubmit = () => {
    setUploading(true);
    const record = {
      role,
      mode: role === "customer" ? "check-out" : "check-in",
      machineId: machine.id,
      machineName: machine.name,
      customerName: customer,
      rentalDate,
      photoCount: Object.values(zp).reduce((a, b) => a + b.length, 0),
      fuelOk: role === "owner" ? fuelOk : null,
      hourMeter: role === "owner" ? hourMeter : null,
      globalNote,
      zones: zones.map(z => ({ zone: z.label, photos: (zp[z.id] || []).length, damage: zn[z.id] || "None" })),
      photos: zp,
    };
    upload(record, (ok, id) => {
      if (ok) {
        // NEW: Notify backend (email + SMS owner, log to Sheets) — fire and forget
        notifyBackend(record, id);
        
        setSubmitted(prev => [...prev, { ...record, id, timestamp: ts() }]);
        setPhotos(p => { const n = { ...p }; delete n[mk]; return n; });
        setNotes(p => { const n = { ...p }; delete n[mk]; return n; });
        setFuelOk(null); setGlobalNote(""); setZone(0); setHourMeter(""); setStep("done");
      }
      setUploading(false);
    });
  };

  const runCompare = () => {
    if (!compareOut.trim() || !compareIn.trim()) return;
    setAiLoading(true);
    aiCompare(compareOut.trim(), compareIn.trim(), result => {
      setAiResult(result);
      setAiLoading(false);
    });
  };

  const reset = () => { setRole(null); setMode(null); setStep("machine"); setMachine(null); setZone(0); setFuelOk(null); setGlobalNote(""); setCompareMode(false); setAiResult(null); setCompareOut(""); setCompareIn(""); setHourMeter(""); };

  const accent = "#D85A30";
  const dark = "#111";
  const muted = "#777";
  const card = "#fff";
  const bg = "#f5f3ee";
  const bdr = "#e0ddd5";
  const green = "#1a8a5c";
  const red = "#c44";

  const btn = (bgColor, color) => ({ padding: "13px 24px", border: "none", borderRadius: 12, background: bgColor, color, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", width: "100%", transition: "opacity 0.15s" });
  const outline = { padding: "11px 18px", border: `1.5px solid ${bdr}`, borderRadius: 12, background: "transparent", color: dark, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.2s" };
  
  // Helper to render a recent inspection card with tap-to-use action
  function RecentCard({ insp, onTap, showSelectButtons, onUseAsCheckout, onUseAsCheckin }) {
    const isCustomer = insp.type === 'customer';
    return (
      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: isCustomer ? "#e8f4fd" : "#fef0ea", color: isCustomer ? "#1e40af" : "#92400e" }}>
                {isCustomer ? "OUT" : "IN"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{insp.customerName || "—"}</span>
            </div>
            <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
              {insp.machineName} · {insp.photoCount} photos · {insp.timestamp}
            </div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: green, marginTop: 4, wordBreak: "break-all" }}>
              {insp.inspectionId}
            </div>
            {insp.damageNotes && (
              <div style={{ fontSize: 10, color: red, marginTop: 4 }}>⚠ {insp.damageNotes}</div>
            )}
          </div>
          {showSelectButtons && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {isCustomer && (
                <button onClick={() => onUseAsCheckout(insp.inspectionId)}
                  style={{ ...outline, padding: "5px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
                  Use as OUT
                </button>
              )}
              {!isCustomer && (
                <button onClick={() => onUseAsCheckin(insp.inspectionId)}
                  style={{ ...outline, padding: "5px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
                  Use as IN
                </button>
              )}
            </div>
          )}
          {!showSelectButtons && (
            <button onClick={() => navigator.clipboard?.writeText(insp.inspectionId)}
              style={{ ...outline, padding: "5px 10px", fontSize: 10, whiteSpace: "nowrap" }}>
              Copy ID
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: bg, minHeight: "100vh", color: dark }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ background: dark, color: "#fff", padding: "18px 20px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.5px" }}>FULL THROTTLE</span>
            <span style={{ fontSize: 10, background: accent, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>INSPECT</span>
          </div>
          {role && <button onClick={reset} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#aaa", fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>Reset</button>}
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
          {role === "customer" ? "📱 Customer self-checkout" : role === "owner" ? "🔧 Owner check-in" : "Watercraft inspection system"}
        </div>
      </div>

      <div style={{ padding: "16px 16px 100px", maxWidth: 500, margin: "0 auto" }}>

        {/* ── ROLE SELECT ── */}
        {!role && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Who's inspecting?</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 24 }}>Select your role to begin the inspection process.</div>

            <div onClick={() => setRole("customer")} style={{ ...outline, width: "100%", padding: "18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#e8f4fd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📱</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>I'm the customer</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Photograph the watercraft before your rental</div>
              </div>
              <span style={{ fontSize: 18, color: accent }}>→</span>
            </div>

            <div onClick={() => setRole("owner")} style={{ ...outline, width: "100%", padding: "18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fef0ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔧</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>I'm the owner</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Check-in with impeller & hull inspection</div>
              </div>
              <span style={{ fontSize: 18, color: accent }}>→</span>
            </div>

            <div onClick={() => { setRole("owner"); setCompareMode(true); }} style={{ ...outline, width: "100%", padding: "18px", display: "flex", alignItems: "center", gap: 14, textAlign: "left" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#f0eaf7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🤖</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>AI damage comparison</div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Compare check-out vs check-in photos</div>
              </div>
              <span style={{ fontSize: 18, color: accent }}>→</span>
            </div>

            {/* NEW: Server-loaded recent inspections (last 30 days) */}
            <div style={{ marginTop: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Recent inspections (30 days)</div>
                <button onClick={loadRecentInspections} style={{ ...outline, padding: "4px 10px", fontSize: 11 }}>
                  {loadingRecent ? "..." : "↻"}
                </button>
              </div>
              {loadingRecent && recentInspections.length === 0 && (
                <div style={{ textAlign: "center", padding: 16, color: muted, fontSize: 12 }}>Loading...</div>
              )}
              {!loadingRecent && recentInspections.length === 0 && (
                <div style={{ textAlign: "center", padding: 16, color: muted, fontSize: 12, background: card, border: `1px solid ${bdr}`, borderRadius: 10 }}>
                  No recent inspections yet
                </div>
              )}
              {recentInspections.slice(0, 10).map((insp, i) => (
                <RecentCard key={i} insp={insp} showSelectButtons={false} />
              ))}
              {recentInspections.length > 10 && (
                <div style={{ textAlign: "center", fontSize: 11, color: muted, marginTop: 4 }}>
                  {recentInspections.length - 10} more not shown
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AI COMPARE MODE ── */}
        {compareMode && (
          <div style={{ marginTop: 20 }}>
            <button onClick={reset} style={{ ...outline, padding: "6px 12px", fontSize: 12, marginBottom: 16 }}>← Back</button>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>🤖 AI damage comparison</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>Tap a recent inspection to autofill, or enter IDs manually.</div>

            {/* NEW: Tappable recent inspections to autofill IDs */}
            <div style={{ marginBottom: 16 }}>
              <input value={recentSearch} onChange={e => setRecentSearch(e.target.value)}
                placeholder="🔍 Search by customer name..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${bdr}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8 }} />
              
              <div style={{ fontSize: 11, fontWeight: 600, color: muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Recent inspections {recentInspections.length > 0 ? `(${recentInspections.length})` : ''}
              </div>
              {recentInspections
                .filter(insp => {
                  if (!recentSearch.trim()) return true;
                  const q = recentSearch.toLowerCase();
                  return (insp.customerName || '').toLowerCase().includes(q) ||
                         (insp.machineName || '').toLowerCase().includes(q) ||
                         (insp.inspectionId || '').toLowerCase().includes(q);
                })
                .slice(0, 10)
                .map((insp, i) => (
                  <RecentCard
                    key={i}
                    insp={insp}
                    showSelectButtons={true}
                    onUseAsCheckout={(id) => setCompareOut(id)}
                    onUseAsCheckin={(id) => setCompareIn(id)}
                  />
                ))}
              {recentInspections.length === 0 && !loadingRecent && (
                <div style={{ textAlign: "center", padding: 16, color: muted, fontSize: 12, background: card, border: `1px solid ${bdr}`, borderRadius: 10 }}>
                  No recent inspections found. Enter IDs manually below.
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>Check-out ID (customer departure)</label>
              <input value={compareOut} onChange={e => setCompareOut(e.target.value)} placeholder="e.g. 1779070781015-s13hofo67"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${bdr}`, fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>Check-in ID (owner return)</label>
              <input value={compareIn} onChange={e => setCompareIn(e.target.value)} placeholder="e.g. 1779072345678-x8kfj2m"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${bdr}`, fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
            </div>

            <button onClick={runCompare} disabled={aiLoading || !compareOut.trim() || !compareIn.trim()} style={{ ...btn(accent, "#fff"), opacity: aiLoading || !compareOut.trim() || !compareIn.trim() ? 0.4 : 1 }}>
              {aiLoading ? "⏳ Analyzing..." : "🤖 Run AI comparison"}
            </button>

            {aiResult && (
              <div style={{ marginTop: 20 }}>
                <div style={{
                  background: aiResult.verdict === "CLEAR" ? "#eaf7f0" : aiResult.verdict === "FEES_APPLY" ? "#fef3c7" : "#fcebeb",
                  border: `1.5px solid ${aiResult.verdict === "CLEAR" ? green : aiResult.verdict === "FEES_APPLY" ? "#d97706" : red}`,
                  borderRadius: 14, padding: 16, marginBottom: 16,
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>
                    {aiResult.verdict === "CLEAR" ? "✅" : aiResult.verdict === "FEES_APPLY" ? "⚠️" : aiResult.verdict === "CRITICAL" ? "🚨" : "⚠️"}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: aiResult.verdict === "CLEAR" ? green : aiResult.verdict === "FEES_APPLY" ? "#92400e" : red }}>
                    {aiResult.verdict === "CLEAR" ? "All clear — no damage detected" :
                     aiResult.verdict === "FEES_APPLY" ? "Fees apply — see details" :
                     aiResult.verdict === "CRITICAL" ? "Critical damage detected" :
                     "Damage found — review required"}
                  </div>
                  <div style={{ fontSize: 12, color: muted }}>
                    {aiResult.customer} · {aiResult.machine}
                  </div>
                </div>

                <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Inspection summary</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: bg, borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: muted }}>Check-out photos</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{aiResult.checkoutPhotos}</div>
                    </div>
                    <div style={{ background: bg, borderRadius: 8, padding: 10, textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: muted }}>Check-in photos</div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>{aiResult.checkinPhotos}</div>
                    </div>
                  </div>
                </div>

                {aiResult.findings.length > 0 && (
                  <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Findings ({aiResult.findings.length})</div>
                    {aiResult.findings.map((f, i) => (
                      <div key={i} style={{ padding: "10px 0", borderBottom: i < aiResult.findings.length - 1 ? `1px solid ${bdr}` : "none", display: "flex", gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                          background: f.severity === "critical" ? "#fcebeb" : f.severity === "damage" ? "#fef3c7" : "#e8f4fd",
                        }}>
                          {f.severity === "critical" ? "🚨" : f.severity === "damage" ? "⚠️" : "💰"}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{f.zone}</div>
                          <div style={{ fontSize: 12, color: muted, marginTop: 1 }}>{f.note}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {aiResult.findings.length === 0 && (
                  <div style={{ textAlign: "center", padding: 20, color: green, fontSize: 13 }}>
                    No damage, no fees. Full deposit refund recommended.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── MACHINE SELECT ── */}
        {role && !compareMode && step === "machine" && (
          <div style={{ marginTop: 20 }}>
            <button onClick={reset} style={{ ...outline, padding: "6px 12px", fontSize: 12, marginBottom: 16 }}>← Back</button>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {role === "customer" ? "📱 Customer check-out" : "🔧 Owner check-in"}
            </div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>
              {role === "customer" ? "Photograph the watercraft before your rental begins." : "Inspect the watercraft upon return."}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>
                {role === "customer" ? "Your name" : "Customer name"}
              </label>
              <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="e.g. John Smith"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${bdr}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>Rental date</label>
              <input type="date" value={rentalDate} onChange={e => setRentalDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${bdr}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 8 }}>Select machine</div>
            {MACHINES.map(m => (
              <button key={m.id} onClick={() => { if (customer.trim()) { setMachine(m); setStep("inspect"); setZone(0); } }}
                style={{ ...outline, width: "100%", padding: "14px 16px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", opacity: customer.trim() ? 1 : 0.4, cursor: customer.trim() ? "pointer" : "not-allowed" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: muted }}>{m.subtitle}</div>
                </div>
                <span style={{ fontSize: 18, color: accent }}>→</span>
              </button>
            ))}

            {role === "customer" && (
              <div style={{ marginTop: 16, padding: 12, background: "#e8f4fd", borderRadius: 10, fontSize: 12, color: "#1e40af", lineHeight: 1.5 }}>
                <strong>Why am I doing this?</strong> These photos protect you. If there's pre-existing damage, your photos prove it was there before your rental. Take clear, well-lit photos of every zone.
              </div>
            )}
          </div>
        )}

        {/* ── ZONE INSPECTION ── */}
        {role && !compareMode && step === "inspect" && cz && (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => zone > 0 ? setZone(zone - 1) : setStep("machine")}
              style={{ ...outline, padding: "6px 12px", fontSize: 12, marginBottom: 12 }}>← Back</button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{machine.name}</div>
                <div style={{ fontSize: 11, color: muted }}>{role === "customer" ? "Check-out" : "Check-in"} · {customer}</div>
              </div>
              <div style={{ background: accent, color: "#fff", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 600 }}>
                {zone + 1}/{zones.length}
              </div>
            </div>

            <div style={{ display: "flex", gap: 3, marginBottom: 14 }}>
              {zones.map((z, i) => (
                <div key={z.id} onClick={() => setZone(i)} style={{ flex: 1, height: 4, borderRadius: 2, cursor: "pointer", background: i === zone ? accent : (zp[z.id] || []).length > 0 ? green : bdr }} />
              ))}
            </div>

            <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: cz.id === "impeller" ? "#fef0ea" : cz.id === "hull-underside" ? "#fef3c7" : "#f0ede6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{cz.icon}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{cz.label}</div>
                  <div style={{ fontSize: 11, color: muted }}>{cp.length} photo{cp.length !== 1 ? "s" : ""}</div>
                </div>
              </div>

              <div style={{ background: bg, borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 12, color: muted, lineHeight: 1.4 }}>
                💡 {cz.hint}
              </div>

              <PhotoBtn onCapture={addPhoto} label={`Photograph ${cz.label.toLowerCase()}`} />

              {cp.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 10 }}>
                  {cp.map((src, i) => <Thumb key={i} src={src} onRemove={() => rmPhoto(i)} />)}
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <input value={cn} onChange={e => setZoneNote(e.target.value)}
                  placeholder={cz.id === "impeller" ? "Note any nicks, bent blades, debris damage…" : "Damage notes (optional)"}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${bdr}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: zone === zones.length - 1 && done >= zones.length ? "1fr 1fr" : "1fr", gap: 8 }}>
              <button onClick={() => zone < zones.length - 1 ? setZone(zone + 1) : null} disabled={cp.length === 0 || zone === zones.length - 1}
                style={{ ...btn(cp.length > 0 && zone < zones.length - 1 ? accent : "#ccc", "#fff"), cursor: cp.length > 0 && zone < zones.length - 1 ? "pointer" : "not-allowed" }}>
                {zone < zones.length - 1 ? "Next zone →" : "All zones complete"}
              </button>
              {zone === zones.length - 1 && done >= zones.length && (
                <button onClick={() => setStep("review")} style={btn(dark, "#fff")}>Review & submit</button>
              )}
            </div>
          </div>
        )}

        {/* ── REVIEW ── */}
        {role && !compareMode && step === "review" && (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => { setStep("inspect"); setZone(zones.length - 1); }} style={{ ...outline, padding: "6px 12px", fontSize: 12, marginBottom: 12 }}>← Back</button>

            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Review — {machine.name}</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 14 }}>{role === "customer" ? "Check-out" : "Check-in"} · {customer} · {ts()}</div>

            <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              {zones.map(z => {
                const zpp = zp[z.id] || []; const znn = zn[z.id] || "";
                const isSpecial = z.id === "impeller" || z.id === "hull-underside";
                return (
                  <div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${bdr}` }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ marginRight: 6 }}>{z.icon}</span>{z.label}
                      {znn && <span style={{ color: isSpecial ? red : accent, fontSize: 11, marginLeft: 6 }}>{isSpecial ? "🚨" : "⚠"} {znn}</span>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: zpp.length > 0 ? green : red }}>{zpp.length} 📷</span>
                  </div>
                );
              })}
            </div>

            {role === "owner" && (
              <>
                <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Hour meter reading</div>
                  <input value={hourMeter} onChange={e => setHourMeter(e.target.value)} placeholder="e.g. 142.5 hours"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${bdr}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>

                <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Fuel check</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button onClick={() => setFuelOk(true)} style={{ ...outline, textAlign: "center", borderColor: fuelOk === true ? green : bdr, background: fuelOk === true ? "#eaf7f0" : "transparent" }}>✅ Full</button>
                    <button onClick={() => setFuelOk(false)} style={{ ...outline, textAlign: "center", borderColor: fuelOk === false ? accent : bdr, background: fuelOk === false ? "#fef0ea" : "transparent" }}>⛽ Refuel fee</button>
                  </div>
                </div>
              </>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>Overall notes</label>
              <textarea value={globalNote} onChange={e => setGlobalNote(e.target.value)} rows={3} placeholder="Additional comments..."
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${bdr}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
            </div>

            <button onClick={handleSubmit} disabled={uploading} style={{ ...btn(accent, "#fff"), opacity: uploading ? 0.5 : 1 }}>
              {uploading ? "⏳ Uploading..." : `✓ Submit ${role === "customer" ? "check-out" : "check-in"}`}
            </button>
          </div>
        )}

        {/* ── DONE ── */}
        {step === "done" && (
          <div style={{ marginTop: 40, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#eaf7f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              {role === "customer" ? "Check-out complete!" : "Check-in complete!"}
            </div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 6 }}>{machine?.name} · {customer}</div>
            {submitted.length > 0 && (
              <>
                <div style={{ background: "#fef0ea", border: `2px solid ${accent}`, borderRadius: 10, padding: 12, margin: "12px 0", textAlign: "left" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Inspection ID</div>
                  <div style={{ fontSize: 13, fontFamily: "monospace", color: dark, wordBreak: "break-all", marginBottom: 6 }}>
                    {submitted[submitted.length - 1].id}
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(submitted[submitted.length - 1].id)}
                    style={{ ...outline, padding: "5px 12px", fontSize: 11 }}>📋 Copy ID</button>
                </div>
                
                <div style={{ background: "#eaf7f0", border: `1px solid ${green}`, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 11, color: green, textAlign: "left" }}>
                  ✅ Saved to inspection log. {role === "owner" ? "Owner email + SMS sent." : "Owner has been notified."}
                </div>
              </>
            )}

            {role === "customer" && (
              <div style={{ background: "#e8f4fd", borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 12, color: "#1e40af", lineHeight: 1.5, textAlign: "left" }}>
                <strong>Your photos protect you.</strong> They're saved with your inspection ID above. If there's any damage dispute, this ID links to your photos.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 300, margin: "0 auto" }}>
              <button onClick={() => { setStep("machine"); setMachine(null); setZone(0); }} style={btn(accent, "#fff")}>Next machine</button>
              <button onClick={reset} style={{ ...outline, width: "100%" }}>Done</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
