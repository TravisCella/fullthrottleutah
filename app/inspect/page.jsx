'use client';

import React from 'react';

// Inline the inspection component directly to avoid import issues
import { useState, useRef, useCallback } from "react";

const ZONES = [
  { id: "bow", label: "Bow / front", icon: "↗" },
  { id: "port", label: "Port side (left)", icon: "←" },
  { id: "starboard", label: "Starboard side (right)", icon: "→" },
  { id: "stern", label: "Stern / rear", icon: "↙" },
  { id: "deck", label: "Deck / seat area", icon: "⬆" },
  { id: "gauge", label: "Gauge / display", icon: "◉" },
  { id: "trailer", label: "Trailer hitch & lights", icon: "▬" },
  { id: "extras", label: "Anchors, vests, fuel level", icon: "⚓" },
];

const MACHINES = [
  { id: "spark-1", name: "Spark #1", subtitle: "2014 Sea-Doo Spark 900 ACE" },
  { id: "spark-2", name: "Spark #2", subtitle: "2014 Sea-Doo Spark 900 ACE" },
  { id: "gtx-1", name: "GTX 325 #1", subtitle: "2026 Sea-Doo GTX Limited 325" },
  { id: "gtx-2", name: "GTX 325 #2", subtitle: "2026 Sea-Doo GTX Limited 325" },
];

function timestamp() {
  return new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function compressImage(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    let width = img.width;
    let height = img.height;
    if (width > 800) {
      height = Math.round((height * 800) / width);
      width = 800;
    }
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    const compressed = canvas.toDataURL("image/jpeg", 0.6);
    callback(compressed);
  };
  img.src = dataUrl;
}

function PhotoCapture({ onCapture, zoneLabel }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setUploading(true);
          const reader = new FileReader();
          reader.onload = () => {
            compressImage(reader.result, (compressed) => {
              onCapture(compressed);
              setUploading(false);
            });
          };
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          width: "100%",
          padding: "10px 0",
          border: "1.5px dashed #b0aea6",
          borderRadius: 10,
          background: uploading ? "#f0ede6" : "transparent",
          cursor: uploading ? "not-allowed" : "pointer",
          fontSize: 13,
          color: "#6b6a65",
          fontFamily: "inherit",
          transition: "border-color 0.2s",
          opacity: uploading ? 0.5 : 1,
        }}
        onMouseEnter={(e) => !uploading && (e.currentTarget.style.borderColor = "#D85A30")}
        onMouseLeave={(e) =>
          !uploading && (e.currentTarget.style.borderColor = "#b0aea6")
        }
      >
        {uploading ? "⏳ Processing..." : `📷 Tap to photograph ${zoneLabel.toLowerCase()}`}
      </button>
    </div>
  );
}

function PhotoThumbnail({ src, note, onRemove }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #e0ddd5",
      }}
    >
      <img
        src={src}
        alt="Inspection"
        style={{
          width: "100%",
          height: 100,
          objectFit: "cover",
          display: "block",
        }}
      />
      {note && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(0,0,0,0.65)",
            color: "#fff",
            fontSize: 11,
            padding: "3px 6px",
            lineHeight: 1.3,
          }}
        >
          {note}
        </div>
      )}
      <button
        onClick={onRemove}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "none",
          background: "rgba(0,0,0,0.5)",
          color: "#fff",
          fontSize: 13,
          cursor: "pointer",
          lineHeight: "22px",
          padding: 0,
          fontFamily: "inherit",
        }}
      >
        ×
      </button>
    </div>
  );
}

function uploadToCloud(record, callback) {
  const recordId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const dbUrl = "https://full-throttle-utah-ac72b-default-rtdb.firebaseio.com";

  const payload = {
    id: recordId,
    mode: record.mode,
    machineId: record.machine.id,
    machineName: record.machine.name,
    customerName: record.customer,
    rentalDate: record.rentalDate,
    timestamp: record.timestamp,
    photoCount: record.photoCount,
    fuelOk: record.fuelOk,
    globalNote: record.globalNote,
    zones: record.zones,
    photos: record.photos,
  };

  fetch(`${dbUrl}/inspections/${recordId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(() => callback(true, recordId))
    .catch((err) => {
      console.error("Upload failed:", err);
      callback(false, null);
    });
}

export default function FullThrottleInspectionCloud() {
  const [mode, setMode] = useState(null);
  const [step, setStep] = useState("select-machine");
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [photos, setPhotos] = useState({});
  const [damageNotes, setDamageNotes] = useState({});
  const [fuelOk, setFuelOk] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [rentalDate, setRentalDate] = useState("");
  const [submitted, setSubmitted] = useState([]);
  const [currentZone, setCurrentZone] = useState(0);
  const [globalNote, setGlobalNote] = useState("");
  const [uploadStatus, setUploadStatus] = useState(null);

  const machineKey = selectedMachine?.id || "";
  const zonePhotos = photos[machineKey] || {};
  const zoneNotes = damageNotes[machineKey] || {};
  const currentZoneData = ZONES[currentZone];
  const currentPhotos = zonePhotos[currentZoneData?.id] || [];
  const currentNote = zoneNotes[currentZoneData?.id] || "";
  const completedZones = Object.keys(zonePhotos).filter(
    (k) => (zonePhotos[k] || []).length > 0
  ).length;
  const allZonesDone = completedZones === ZONES.length;

  const addPhoto = useCallback(
    (dataUrl) => {
      setPhotos((prev) => {
        const machine = { ...(prev[machineKey] || {}) };
        const zone = [...(machine[currentZoneData.id] || [])];
        zone.push(dataUrl);
        machine[currentZoneData.id] = zone;
        return { ...prev, [machineKey]: machine };
      });
    },
    [machineKey, currentZoneData]
  );

  const removePhoto = useCallback(
    (idx) => {
      setPhotos((prev) => {
        const machine = { ...(prev[machineKey] || {}) };
        const zone = [...(machine[currentZoneData.id] || [])];
        zone.splice(idx, 1);
        machine[currentZoneData.id] = zone;
        return { ...prev, [machineKey]: machine };
      });
    },
    [machineKey, currentZoneData]
  );

  const setZoneNote = useCallback(
    (val) => {
      setDamageNotes((prev) => {
        const machine = { ...(prev[machineKey] || {}) };
        machine[currentZoneData.id] = val;
        return { ...prev, [machineKey]: machine };
      });
    },
    [machineKey, currentZoneData]
  );

  const handleSubmit = () => {
    const record = {
      mode,
      machine: selectedMachine,
      customer: customerName,
      rentalDate,
      timestamp: timestamp(),
      photoCount: Object.values(zonePhotos).reduce((a, b) => a + b.length, 0),
      fuelOk: mode === "check-in" ? fuelOk : null,
      globalNote,
      zones: ZONES.map((z) => ({
        zone: z.label,
        photos: (zonePhotos[z.id] || []).length,
        damage: zoneNotes[z.id] || "None",
      })),
      photos: zonePhotos,
    };

    setUploadStatus("uploading");
    uploadToCloud(record, (success, recordId) => {
      if (success) {
        setUploadStatus(`success-${recordId}`);
        setSubmitted((prev) => [...prev, { ...record, id: recordId }]);
        setPhotos((prev) => {
          const p = { ...prev };
          delete p[machineKey];
          return p;
        });
        setDamageNotes((prev) => {
          const p = { ...prev };
          delete p[machineKey];
          return p;
        });
        setFuelOk(null);
        setGlobalNote("");
        setCurrentZone(0);
        setStep("done");
      } else {
        setUploadStatus("error");
      }
    });
  };

  const reset = () => {
    setMode(null);
    setStep("select-machine");
    setSelectedMachine(null);
    setCurrentZone(0);
    setFuelOk(null);
    setGlobalNote("");
    setUploadStatus(null);
  };

  const bg = "#f7f5f0";
  const accent = "#D85A30";
  const dark = "#1a1917";
  const muted = "#7a7870";
  const cardBg = "#ffffff";
  const borderClr = "#e0ddd5";

  const btnPrimary = {
    padding: "12px 24px",
    border: "none",
    borderRadius: 10,
    background: accent,
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    width: "100%",
    transition: "opacity 0.15s",
  };

  const btnOutline = {
    padding: "10px 20px",
    border: `1.5px solid ${borderClr}`,
    borderRadius: 10,
    background: "transparent",
    color: dark,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "border-color 0.2s",
  };

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
        background: bg,
        minHeight: "100vh",
        color: dark,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div
        style={{
          background: dark,
          color: "#fff",
          padding: "20px 20px 16px",
          borderRadius: "0 0 20px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.5px" }}>
            FULL THROTTLE
          </span>
          <span
            style={{
              fontSize: 11,
              background: accent,
              padding: "2px 8px",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
            INSPECT
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#a09e96" }}>
          Watercraft check-in / check-out · Cloud-synced
        </div>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>
        {!mode && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
              Start inspection
            </div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
              Select whether the customer is picking up or returning.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Customer name
              </label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. John Smith"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${borderClr}`,
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: cardBg,
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Rental date
              </label>
              <input
                type="date"
                value={rentalDate}
                onChange={(e) => setRentalDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${borderClr}`,
                  fontSize: 14,
                  fontFamily: "inherit",
                  background: cardBg,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                onClick={() => {
                  if (customerName.trim()) setMode("check-out");
                }}
                style={{
                  ...btnPrimary,
                  background: customerName.trim() ? accent : "#ccc",
                  cursor: customerName.trim() ? "pointer" : "not-allowed",
                }}
              >
                ➤ Check-out
              </button>
              <button
                onClick={() => {
                  if (customerName.trim()) setMode("check-in");
                }}
                style={{
                  ...btnPrimary,
                  background: customerName.trim() ? dark : "#ccc",
                  cursor: customerName.trim() ? "pointer" : "not-allowed",
                }}
              >
                ⬅ Check-in
              </button>
            </div>
          </div>
        )}

        {mode && step === "select-machine" && (
          <div style={{ marginTop: 20 }}>
            <button
              onClick={reset}
              style={{
                ...btnOutline,
                marginBottom: 16,
                padding: "6px 14px",
                fontSize: 12,
              }}
            >
              ← Back
            </button>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              {mode === "check-out" ? "Check-out" : "Check-in"} — select machine
            </div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>
              Customer: {customerName}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {MACHINES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedMachine(m);
                    setStep("inspect");
                    setCurrentZone(0);
                  }}
                  style={{
                    ...btnOutline,
                    textAlign: "left",
                    width: "100%",
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = borderClr)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: muted }}>{m.subtitle}</div>
                  </div>
                  <span style={{ fontSize: 18, color: accent }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode && step === "inspect" && currentZoneData && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() =>
                currentZone > 0
                  ? setCurrentZone(currentZone - 1)
                  : setStep("select-machine")
              }
              style={{
                ...btnOutline,
                marginBottom: 12,
                padding: "6px 14px",
                fontSize: 12,
              }}
            >
              ← Back
            </button>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedMachine.name}</div>
                <div style={{ fontSize: 12, color: muted }}>
                  {mode === "check-out" ? "Check-out" : "Check-in"} · {customerName}
                </div>
              </div>
              <div
                style={{
                  background: accent,
                  color: "#fff",
                  borderRadius: 20,
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {currentZone + 1} / {ZONES.length}
              </div>
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {ZONES.map((z, i) => (
                <div
                  key={z.id}
                  onClick={() => setCurrentZone(i)}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    cursor: "pointer",
                    background:
                      i === currentZone
                        ? accent
                        : (zonePhotos[z.id] || []).length > 0
                          ? "#4a9"
                          : borderClr,
                    transition: "background 0.2s",
                  }}
                />
              ))}
            </div>

            <div
              style={{
                background: cardBg,
                border: `1px solid ${borderClr}`,
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "#f0ede6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                  }}
                >
                  {currentZoneData.icon}
                </span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {currentZoneData.label}
                  </div>
                  <div style={{ fontSize: 11, color: muted }}>
                    {currentPhotos.length} photo{currentPhotos.length !== 1 ? "s" : ""} captured
                  </div>
                </div>
              </div>

              <PhotoCapture onCapture={addPhoto} zoneLabel={currentZoneData.label} />

              {currentPhotos.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                  {currentPhotos.map((src, i) => (
                    <PhotoThumbnail key={i} src={src} onRemove={() => removePhoto(i)} />
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: muted,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Damage notes (optional)
                </label>
                <input
                  value={currentNote}
                  onChange={(e) => setZoneNote(e.target.value)}
                  placeholder="Describe any scratches, dents, or issues…"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1.5px solid ${borderClr}`,
                    fontSize: 13,
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => currentZone < ZONES.length - 1 && setCurrentZone(currentZone + 1)}
                disabled={currentPhotos.length === 0}
                style={{
                  ...btnPrimary,
                  background: currentPhotos.length > 0 ? accent : "#ccc",
                  cursor: currentPhotos.length > 0 ? "pointer" : "not-allowed",
                }}
              >
                {currentZone < ZONES.length - 1 ? "Next zone →" : "Review"}
              </button>
              {currentZone === ZONES.length - 1 && allZonesDone && (
                <button onClick={() => setStep("review")} style={btnPrimary}>
                  Review & submit
                </button>
              )}
            </div>
          </div>
        )}

        {mode && step === "review" && (
          <div style={{ marginTop: 16 }}>
            <button
              onClick={() => {
                setStep("inspect");
                setCurrentZone(ZONES.length - 1);
              }}
              style={{
                ...btnOutline,
                marginBottom: 12,
                padding: "6px 14px",
                fontSize: 12,
              }}
            >
              ← Back to photos
            </button>

            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Review — {selectedMachine.name}
            </div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 16 }}>
              {mode === "check-out" ? "Check-out" : "Check-in"} · {customerName} ·{" "}
              {timestamp()}
            </div>

            <div
              style={{
                background: cardBg,
                border: `1px solid ${borderClr}`,
                borderRadius: 14,
                padding: 16,
                marginBottom: 16,
              }}
            >
              {ZONES.map((z) => {
                const zp = zonePhotos[z.id] || [];
                const zn = zoneNotes[z.id] || "";
                return (
                  <div
                    key={z.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 0",
                      borderBottom: `1px solid ${borderClr}`,
                    }}
                  >
                    <div style={{ fontSize: 13 }}>
                      <span style={{ marginRight: 6 }}>{z.icon}</span>
                      {z.label}
                      {zn && (
                        <span style={{ color: accent, fontSize: 11, marginLeft: 6 }}>
                          ⚠ {zn}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: zp.length > 0 ? "#4a9" : "#c44",
                      }}
                    >
                      {zp.length} 📷
                    </span>
                  </div>
                );
              })}
            </div>

            {mode === "check-in" && (
              <div
                style={{
                  background: cardBg,
                  border: `1px solid ${borderClr}`,
                  borderRadius: 14,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                  Fuel check
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    onClick={() => setFuelOk(true)}
                    style={{
                      ...btnOutline,
                      textAlign: "center",
                      borderColor: fuelOk === true ? "#4a9" : borderClr,
                      background: fuelOk === true ? "#eaf7f0" : "transparent",
                    }}
                  >
                    ✅ Returned full
                  </button>
                  <button
                    onClick={() => setFuelOk(false)}
                    style={{
                      ...btnOutline,
                      textAlign: "center",
                      borderColor: fuelOk === false ? accent : borderClr,
                      background: fuelOk === false ? "#fef0ea" : "transparent",
                    }}
                  >
                    ⛽ Needs refuel fee
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 6 }}>
                Overall notes
              </label>
              <textarea
                value={globalNote}
                onChange={(e) => setGlobalNote(e.target.value)}
                rows={3}
                placeholder="Any additional comments about condition, behavior, etc."
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1.5px solid ${borderClr}`,
                  fontSize: 13,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
            </div>

            {uploadStatus === "uploading" && (
              <div
                style={{
                  background: "#fef0ea",
                  border: `1px solid ${accent}`,
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                  fontSize: 13,
                  color: accent,
                  textAlign: "center",
                }}
              >
                ⏳ Uploading to cloud...
              </div>
            )}

            {uploadStatus?.startsWith("success") && (
              <div
                style={{
                  background: "#eaf7f0",
                  border: "1px solid #4a9",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                  fontSize: 13,
                  color: "#2a7d64",
                  textAlign: "center",
                }}
              >
                ✓ Synced to cloud
              </div>
            )}

            {uploadStatus === "error" && (
              <div
                style={{
                  background: "#fcebeb",
                  border: "1px solid #c44",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                  fontSize: 13,
                  color: "#c44",
                  textAlign: "center",
                }}
              >
                ✗ Upload failed — check connection
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={uploadStatus === "uploading"}
              style={{
                ...btnPrimary,
                opacity: uploadStatus === "uploading" ? 0.6 : 1,
                cursor: uploadStatus === "uploading" ? "not-allowed" : "pointer",
              }}
            >
              ✓ Submit {mode === "check-out" ? "check-out" : "check-in"} report
            </button>
          </div>
        )}

        {step === "done" && (
          <div style={{ marginTop: 40, textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#eaf7f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                margin: "0 auto 16px",
              }}
            >
              ✓
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
              Report submitted
            </div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 24 }}>
              {selectedMachine?.name} — {mode === "check-out" ? "checked out to" : "checked in from"}{" "}
              {customerName}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                maxWidth: 320,
                margin: "0 auto",
              }}
            >
              <button
                onClick={() => {
                  setStep("select-machine");
                  setSelectedMachine(null);
                }}
                style={btnPrimary}
              >
                Next machine
              </button>
              <button onClick={reset} style={{ ...btnOutline, width: "100%" }}>
                New session
              </button>
            </div>
          </div>
        )}

        {submitted.length > 0 && (step === "done" || !mode) && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
              Completed inspections
            </div>
            {submitted.map((r, i) => (
              <div
                key={i}
                style={{
                  background: cardBg,
                  border: `1px solid ${borderClr}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.machine.name}</div>
                  <div style={{ fontSize: 11, color: muted }}>
                    {r.mode === "check-out" ? "OUT" : "IN"} · {r.customer} · {r.photoCount} photos
                    {r.fuelOk === false && (
                      <span style={{ color: accent, fontWeight: 600, marginLeft: 6 }}>
                        ⛽ Refuel fee
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: muted, textAlign: "right" }}>
                  {r.timestamp}
                  {r.id && (
                    <div style={{ fontSize: 10, fontFamily: "monospace", color: "#4a9" }}>
                      ID: {r.id.substr(0, 8)}...
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

