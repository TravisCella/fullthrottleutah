// app/agreement/[bookingId]/sign/SignAgreementClient.jsx
// Version: 2026-06-10 v2 — Fixed to match actual agreement-text.js shapes
// Last edited: June 10 2026
//
// v2 fix: My v1 assumed AGREEMENT_PREAMBLE was a string, AGREEMENT_SECTIONS
// had {id, title, body} shape, AGREEMENT_CHECKBOXES had {id, label, body},
// and AGREEMENT_APPENDIX was a string. None of those were correct — caused
// React error #31 (object with keys {title, about}) when AGREEMENT_PREAMBLE
// (which is actually { title, about: [...] }) was rendered as a JSX child.
//
// Now matches the real shapes from lib/agreement-text.js:
//   - AGREEMENT_PREAMBLE = { title, about: [strings] }
//   - AGREEMENT_SECTIONS = [{ number, title, intro, clauses: [{ id, text, bullets, footer }] }]
//   - AGREEMENT_CHECKBOXES = [{ id, label }] (no body)
//   - AGREEMENT_APPENDIX = { title, intro, references: [strings], conflict }

'use client';

import { useState, useEffect, useRef } from 'react';
import {
  AGREEMENT_PREAMBLE,
  AGREEMENT_SECTIONS,
  AGREEMENT_CHECKBOXES,
  AGREEMENT_APPENDIX,
} from '../../../../lib/agreement-text';

const NAVY = '#0C4A6E';
const ORANGE = '#EA580C';
const SLATE = '#475569';
const SLATE_DARK = '#0F172A';
const SLATE_LIGHT = '#94A3B8';

export default function SignAgreementClient({ booking, agreementVersion }) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [checks, setChecks] = useState(
    AGREEMENT_CHECKBOXES.reduce((acc, c) => ({ ...acc, [c.id]: false }), {})
  );
  const [signature, setSignature] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const bottomSentinelRef = useRef(null);

  // Scroll-gating: watch a hidden sentinel at the end of agreement text
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setScrolledToBottom(true);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const allChecked = AGREEMENT_CHECKBOXES.every(c => checks[c.id]);
  const canSubmit = scrolledToBottom && allChecked && signature && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/sign-agreement-retroactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.booking_id,
          agreementVersion,
          signatureDataUrl: signature,
          checksJson: JSON.stringify(checks),
          signedAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Server error' }));
        throw new Error(data.error || `Request failed (HTTP ${res.status})`);
      }

      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return <SuccessState booking={booking} />;
  }

  return (
    <Shell>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: 'inline-block',
          background: '#FEF3C7',
          color: '#92400E',
          padding: '4px 12px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 12,
        }}>
          Action needed before pickup
        </div>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 28,
          color: SLATE_DARK,
          margin: '0 0 8px',
          letterSpacing: '-0.01em',
        }}>
          Sign your rental agreement
        </h1>
        <p style={{ fontSize: 15, color: SLATE, lineHeight: 1.6, margin: 0 }}>
          Hi {booking.renter_name?.split(' ')[0] || 'there'} — we've updated our rental agreement and need your signature before you pick up. Takes about 2 minutes.
        </p>
      </div>

      {/* Booking summary */}
      <div style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        padding: 18,
        marginBottom: 24,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: SLATE_LIGHT,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 10,
        }}>
          Your Booking
        </div>
        <Row label="Package" value={booking.package} />
        <Row label="Location" value={booking.location} />
        <Row label="Dates" value={formatDateRange(booking.start_date, booking.end_date)} />
        <Row label="Total paid" value={`$${booking.total_price}`} />
      </div>

      {/* Progress indicator */}
      <ProgressIndicator
        scrolledToBottom={scrolledToBottom}
        allChecked={allChecked}
        hasSignature={!!signature}
      />

      {/* Agreement text */}
      <div style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        padding: 20,
        maxHeight: 420,
        overflowY: 'auto',
        marginBottom: 16,
        fontSize: 13,
        lineHeight: 1.6,
        color: SLATE,
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: NAVY,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 12,
        }}>
          Rental Agreement {agreementVersion}
        </div>

        {/* PREAMBLE */}
        {AGREEMENT_PREAMBLE && (
          <div style={{ marginBottom: 22 }}>
            {AGREEMENT_PREAMBLE.title && (
              <h2 style={{
                fontSize: 14,
                fontWeight: 700,
                color: SLATE_DARK,
                margin: '0 0 10px',
                letterSpacing: '0.01em',
              }}>
                {AGREEMENT_PREAMBLE.title}
              </h2>
            )}
            {Array.isArray(AGREEMENT_PREAMBLE.about) &&
              AGREEMENT_PREAMBLE.about.map((paragraph, i) => (
                <p key={i} style={{
                  fontSize: 13,
                  color: SLATE,
                  lineHeight: 1.6,
                  margin: '0 0 10px',
                }}>
                  {paragraph}
                </p>
              ))}
          </div>
        )}

        {/* SECTIONS */}
        {AGREEMENT_SECTIONS.map((section) => (
          <div key={section.number} style={{ marginBottom: 18 }}>
            <h3 style={{
              fontSize: 13,
              fontWeight: 700,
              color: SLATE_DARK,
              margin: '0 0 6px',
            }}>
              {section.number}. {section.title}
            </h3>
            {section.intro && (
              <p style={{
                fontSize: 13,
                color: SLATE,
                lineHeight: 1.6,
                margin: '4px 0 8px',
              }}>
                {section.intro}
              </p>
            )}
            {Array.isArray(section.clauses) && section.clauses.map((clause) => (
              <div key={clause.id} style={{ marginBottom: 8 }}>
                <p style={{
                  fontSize: 13,
                  color: SLATE,
                  lineHeight: 1.6,
                  margin: '0 0 4px',
                }}>
                  <strong style={{ color: SLATE_DARK, fontWeight: 600 }}>{clause.id}</strong> {clause.text}
                </p>
                {Array.isArray(clause.bullets) && clause.bullets.length > 0 && (
                  <ul style={{
                    margin: '4px 0 4px 20px',
                    padding: 0,
                    fontSize: 13,
                    color: SLATE,
                    lineHeight: 1.55,
                  }}>
                    {clause.bullets.map((b, i) => (
                      <li key={i} style={{ marginBottom: 3 }}>{b}</li>
                    ))}
                  </ul>
                )}
                {clause.footer && (
                  <p style={{
                    fontSize: 12,
                    color: SLATE_LIGHT,
                    fontStyle: 'italic',
                    margin: '4px 0 0',
                  }}>
                    {clause.footer}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* APPENDIX */}
        {AGREEMENT_APPENDIX && (
          <div style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid #E2E8F0',
          }}>
            {AGREEMENT_APPENDIX.title && (
              <h3 style={{
                fontSize: 13,
                fontWeight: 700,
                color: SLATE_DARK,
                margin: '0 0 6px',
              }}>
                {AGREEMENT_APPENDIX.title}
              </h3>
            )}
            {AGREEMENT_APPENDIX.intro && (
              <p style={{
                fontSize: 13,
                color: SLATE,
                lineHeight: 1.6,
                margin: '0 0 8px',
              }}>
                {AGREEMENT_APPENDIX.intro}
              </p>
            )}
            {Array.isArray(AGREEMENT_APPENDIX.references) &&
              AGREEMENT_APPENDIX.references.length > 0 && (
                <ul style={{
                  margin: '4px 0 8px 20px',
                  padding: 0,
                  fontSize: 13,
                  color: SLATE,
                  lineHeight: 1.55,
                }}>
                  {AGREEMENT_APPENDIX.references.map((ref, i) => (
                    <li key={i} style={{ marginBottom: 3 }}>{ref}</li>
                  ))}
                </ul>
              )}
            {AGREEMENT_APPENDIX.conflict && (
              <p style={{
                fontSize: 12,
                color: SLATE_LIGHT,
                fontStyle: 'italic',
                margin: '8px 0 0',
              }}>
                {AGREEMENT_APPENDIX.conflict}
              </p>
            )}
          </div>
        )}

        {/* Scroll-completion sentinel */}
        <div ref={bottomSentinelRef} style={{ height: 1 }} />
      </div>

      {!scrolledToBottom && (
        <div style={hintStyle()}>
          ↑ Please scroll through the full agreement above to continue.
        </div>
      )}

      {/* Checkboxes */}
      <div style={{
        marginBottom: 24,
        opacity: scrolledToBottom ? 1 : 0.4,
        pointerEvents: scrolledToBottom ? 'auto' : 'none',
        transition: 'opacity 0.3s',
      }}>
        <div style={sectionLabel()}>I acknowledge that</div>
        {AGREEMENT_CHECKBOXES.map((cb) => (
          <CheckboxCard
            key={cb.id}
            checked={checks[cb.id]}
            onChange={(v) => setChecks((prev) => ({ ...prev, [cb.id]: v }))}
            label={cb.label}
            disabled={!scrolledToBottom}
          />
        ))}
      </div>

      {/* Signature canvas */}
      <div style={{
        marginBottom: 24,
        opacity: allChecked ? 1 : 0.4,
        pointerEvents: allChecked ? 'auto' : 'none',
        transition: 'opacity 0.3s',
      }}>
        <div style={sectionLabel()}>Your signature</div>
        <p style={{ fontSize: 13, color: SLATE, margin: '0 0 10px', lineHeight: 1.5 }}>
          Sign with your finger (mobile) or mouse (desktop).
        </p>
        <SignaturePad onChange={setSignature} disabled={!allChecked} />
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: '#FEE2E2',
          color: '#991B1B',
          padding: 12,
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 16,
          border: '1px solid #FCA5A5',
        }}>
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          width: '100%',
          padding: '16px',
          background: canSubmit ? '#16A34A' : '#CBD5E1',
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          fontSize: 16,
          fontWeight: 700,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          transition: 'background 0.2s',
        }}
      >
        {isSubmitting ? 'Submitting…' : 'Submit signed agreement →'}
      </button>

      <p style={{
        fontSize: 11,
        color: SLATE_LIGHT,
        textAlign: 'center',
        marginTop: 14,
        lineHeight: 1.5,
      }}>
        By clicking Submit, you confirm you've read the agreement and electronically sign it.
        Your signature is legally binding.
      </p>
    </Shell>
  );
}

// ─── Shell + helpers ──────────────────────────────────────────────

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0B1120',
      fontFamily: "'Outfit', system-ui, sans-serif",
      padding: '32px 16px',
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap"
        rel="stylesheet"
      />
      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        background: '#fff',
        borderRadius: 16,
        padding: 28,
        boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: SLATE_LIGHT }}>{label}</span>
      <span style={{ fontSize: 14, color: SLATE_DARK, fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ProgressIndicator({ scrolledToBottom, allChecked, hasSignature }) {
  const steps = [
    { label: 'Read', done: scrolledToBottom },
    { label: 'Acknowledge', done: allChecked },
    { label: 'Sign', done: hasSignature },
  ];
  return (
    <div style={{
      display: 'flex',
      gap: 8,
      marginBottom: 16,
    }}>
      {steps.map((s, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 8,
            background: s.done ? '#DCFCE7' : '#F1F5F9',
            color: s.done ? '#166534' : SLATE_LIGHT,
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'center',
            border: `1px solid ${s.done ? '#86EFAC' : '#E2E8F0'}`,
          }}
        >
          {s.done ? '✓ ' : `${i + 1}. `}{s.label}
        </div>
      ))}
    </div>
  );
}

function CheckboxCard({ checked, onChange, label, disabled }) {
  return (
    <label
      style={{
        display: 'flex',
        gap: 10,
        padding: 14,
        marginBottom: 8,
        border: `1.5px solid ${checked ? '#16A34A' : '#E2E8F0'}`,
        borderRadius: 10,
        background: checked ? '#F0FDF4' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{
          marginTop: 2,
          flexShrink: 0,
          width: 18,
          height: 18,
          cursor: disabled ? 'not-allowed' : 'pointer',
          accentColor: '#16A34A',
        }}
      />
      <div style={{ fontSize: 14, fontWeight: 500, color: SLATE_DARK, lineHeight: 1.4 }}>
        {label}
      </div>
    </label>
  );
}

function SignaturePad({ onChange, disabled }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  function getPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function start(e) {
    if (disabled) return;
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  }

  function end(e) {
    if (!isDrawing) return;
    if (e.preventDefault) e.preventDefault();
    setIsDrawing(false);
    if (hasSignature) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onChange(dataUrl);
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);
    setHasSignature(false);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 160,
          background: disabled ? '#F1F5F9' : '#fff',
          border: `2px dashed ${disabled ? '#CBD5E1' : '#94A3B8'}`,
          borderRadius: 10,
          cursor: disabled ? 'not-allowed' : 'crosshair',
          touchAction: 'none',
          display: 'block',
        }}
        onMouseDown={start}
        onMouseMove={draw}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={draw}
        onTouchEnd={end}
      />
      {hasSignature && !disabled && (
        <button
          type="button"
          onClick={clear}
          style={{
            marginTop: 10,
            padding: '6px 14px',
            background: 'transparent',
            border: '1px solid #CBD5E1',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            color: SLATE,
          }}
        >
          Clear signature
        </button>
      )}
    </div>
  );
}

function SuccessState({ booking }) {
  return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: '#DCFCE7',
          color: '#16A34A',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          marginBottom: 20,
        }}>
          ✓
        </div>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 28,
          color: SLATE_DARK,
          margin: '0 0 12px',
        }}>
          Agreement signed!
        </h1>
        <p style={{ fontSize: 15, color: SLATE, lineHeight: 1.6, marginBottom: 24 }}>
          Thanks, {booking.renter_name?.split(' ')[0] || 'rider'}. Your signed agreement is on file. We'll see you at pickup on {formatDate(booking.start_date)}.
        </p>
        <a
          href={`/agreement/${booking.booking_id}`}
          style={{
            background: NAVY,
            color: '#fff',
            padding: '12px 24px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          View your signed agreement →
        </a>
      </div>
    </Shell>
  );
}

// ─── Style helpers ────────────────────────────────────────────────

function sectionLabel() {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 10,
  };
}

function hintStyle() {
  return {
    background: '#FEF3C7',
    color: '#92400E',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 16,
    textAlign: 'center',
  };
}

function formatDate(s) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return s;
  }
}

function formatDateRange(start, end) {
  if (!start) return '';
  if (!end || start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}
