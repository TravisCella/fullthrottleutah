'use client';

// app/review/[bookingId]/page.jsx
// Version: 2026-06-02 — Customer-facing review submission form
// Created: June 2 2026
// Mobile-first form matching the main site's dark/navy/orange palette.
// Pre-fetches booking context to personalize and detect duplicate submissions.

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

// Palette — matches fullthrottleutah.com landing
const BG = '#0B1120';
const CARD = '#fff';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const NAVY = '#0C4A6E';
const ORANGE = '#EA580C';
const GOLD = '#F59E0B';
const BORDER = '#E2E8F0';
const SUCCESS = '#16A34A';
const ERROR = '#DC2626';

function StarPicker({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '8px 0 4px' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            fontSize: 42,
            lineHeight: 1,
            color: n <= display ? GOLD : '#D1D5DB',
            transition: 'transform 0.1s, color 0.15s',
            transform: n === display ? 'scale(1.1)' : 'scale(1)',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function RatingLabel({ rating }) {
  if (!rating) return null;
  const labels = {
    1: { text: 'Not great', color: '#991B1B' },
    2: { text: 'Could be better', color: '#92400E' },
    3: { text: 'It was okay', color: '#92400E' },
    4: { text: 'Pretty good', color: '#166534' },
    5: { text: 'Amazing!', color: '#166534' },
  };
  const l = labels[rating];
  return (
    <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: l.color, marginBottom: 8 }}>
      {l.text}
    </div>
  );
}

export default function ReviewPage() {
  const params = useParams();
  const bookingId = params.bookingId;

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [existingReview, setExistingReview] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [allowPublish, setAllowPublish] = useState(true);
  const [privateNote, setPrivateNote] = useState('');
  const [showPrivateNote, setShowPrivateNote] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submittedResult, setSubmittedResult] = useState(null);

  // Fetch booking context on mount
  useEffect(() => {
    if (!bookingId) return;
    fetch(`/api/submit-review?bookingId=${encodeURIComponent(bookingId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setLoadError(data.error);
        } else {
          setBooking(data.booking);
          setExistingReview(data.existing_review);
          setDisplayName(data.booking.suggested_display_name || '');
        }
      })
      .catch(() => setLoadError('Could not load this review form. Please try again.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitError(null);

    if (!rating) {
      setSubmitError('Please pick a star rating.');
      return;
    }
    if (reviewText.trim().length < 20) {
      setSubmitError('Please write a few sentences about your rental (at least 20 characters).');
      return;
    }
    if (!displayName.trim()) {
      setSubmitError('Please tell us how you\'d like your name to appear.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/submit-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          rating,
          reviewText: reviewText.trim(),
          displayName: displayName.trim(),
          allowPublish,
          privateNote: privateNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
      } else {
        setSubmittedResult(data);
      }
    } catch {
      setSubmitError('Connection error. Please try again.');
    }
    setSubmitting(false);
  };

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '60px 20px', color: MUTED }}>
          Loading...
        </div>
      </Shell>
    );
  }

  // ── ERROR (bad link, booking not found) ────────────────────────────────────
  if (loadError) {
    return (
      <Shell>
        <div style={{ background: CARD, borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🤔</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Hmm, something's off</div>
          <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>{loadError}</div>
        </div>
      </Shell>
    );
  }

  // ── ALREADY REVIEWED ──────────────────────────────────────────────────────
  if (existingReview) {
    return (
      <Shell>
        <div style={{ background: CARD, borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>You've already reviewed this rental</div>
          <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, marginBottom: 12 }}>
            We received your {existingReview.rating}-star review. Thanks for taking the time!
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>
            Want to share more? Email us at{' '}
            <a href="mailto:bookings@fullthrottleutah.com" style={{ color: NAVY }}>
              bookings@fullthrottleutah.com
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  // ── SUBMITTED ─────────────────────────────────────────────────────────────
  if (submittedResult) {
    const isHighRating = submittedResult.rating >= 4;
    return (
      <Shell>
        <div style={{ background: CARD, borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: SUCCESS }}>
            Thank you, {booking.renter_first_name}!
          </div>
          <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, marginBottom: 24 }}>
            {submittedResult.message}
          </div>

          {isHighRating && (
            <div style={{ background: '#FEF3C7', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#92400E', marginBottom: 8 }}>
                💛 Help others find us
              </div>
              <div style={{ fontSize: 13, color: '#92400E', marginBottom: 14, lineHeight: 1.5 }}>
                Would you also leave a quick review on Google? It helps other Utah riders find us. Takes 30 seconds.
              </div>
              <a
                href="https://www.google.com/search?q=Full+Throttle+Utah+Farmington+jet+ski+rental"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  background: '#1F2937',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                ⭐ Leave a Google Review →
              </a>
            </div>
          )}

          <a
            href="https://www.fullthrottleutah.com"
            style={{ fontSize: 13, color: NAVY, textDecoration: 'none' }}
          >
            ← Back to Full Throttle Utah
          </a>
        </div>
      </Shell>
    );
  }

  // ── MAIN FORM ─────────────────────────────────────────────────────────────
  const dateLabel =
    booking.end_date && booking.end_date !== booking.start_date
      ? `${booking.start_date} → ${booking.end_date}`
      : booking.start_date;

  return (
    <Shell>
      {/* Greeting card */}
      <div style={{ background: CARD, borderRadius: 16, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          Hi {booking.renter_first_name || 'there'} 👋
        </div>
        <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
          Thanks for renting with us! Mind sharing how your trip went? Your review helps other Utah riders decide and helps us keep improving.
        </div>
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: '#F8FAFC',
            borderRadius: 8,
            fontSize: 12,
            color: MUTED,
          }}
        >
          📅 <strong>{booking.package}</strong> · {booking.location} · {dateLabel}
        </div>
      </div>

      {/* Form */}
      <div style={{ background: CARD, borderRadius: 16, padding: 24 }}>
        {/* Rating */}
        <Label>How was your rental?</Label>
        <StarPicker value={rating} onChange={setRating} />
        <RatingLabel rating={rating} />

        {/* Review text */}
        <Label>Tell us about your trip</Label>
        <textarea
          value={reviewText}
          onChange={e => setReviewText(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="What stood out? Pickup experience? Equipment quality? Anything we should improve?"
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 10,
            border: `1.5px solid ${BORDER}`,
            fontSize: 14,
            fontFamily: 'inherit',
            lineHeight: 1.5,
            resize: 'vertical',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4, textAlign: 'right' }}>
          {reviewText.length} / 2000
        </div>

        {/* Display name */}
        <Label>Name to display on our website</Label>
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          maxLength={80}
          placeholder="e.g. Israel A."
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4, marginBottom: 14 }}>
          Most folks use first name + last initial.
        </div>

        {/* Publish toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            background: '#F8FAFC',
            borderRadius: 10,
            cursor: 'pointer',
            marginBottom: 12,
          }}
        >
          <input
            type="checkbox"
            checked={allowPublish}
            onChange={e => setAllowPublish(e.target.checked)}
            style={{ marginTop: 3, accentColor: NAVY, width: 18, height: 18 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Publish this review on the website</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Uncheck if you'd rather keep your feedback private to us.
            </div>
          </div>
        </label>

        {/* Toggle for private note */}
        {!showPrivateNote ? (
          <button
            type="button"
            onClick={() => setShowPrivateNote(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: NAVY,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 18,
              fontFamily: 'inherit',
            }}
          >
            + Add a private note (just to us)
          </button>
        ) : (
          <div style={{ marginBottom: 18 }}>
            <Label>Private note (never published)</Label>
            <textarea
              value={privateNote}
              onChange={e => setPrivateNote(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Anything for our eyes only — issues, suggestions, etc."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        )}

        {/* Error */}
        {submitError && (
          <div
            style={{
              background: '#FEE2E2',
              color: '#991B1B',
              padding: 12,
              borderRadius: 10,
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            ⚠️ {submitError}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 12,
            border: 'none',
            background: submitting ? '#94A3B8' : ORANGE,
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {submitting ? 'Submitting...' : 'Submit Review'}
        </button>

        <div style={{ fontSize: 11, color: MUTED, marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
          Questions? Email{' '}
          <a href="mailto:bookings@fullthrottleutah.com" style={{ color: NAVY }}>
            bookings@fullthrottleutah.com
          </a>{' '}
          or call (801) 548-1273.
        </div>
      </div>
    </Shell>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────────
function Shell({ children }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '40px 16px',
        color: TEXT,
      }}
    >
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              color: '#fff',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '-0.5px',
              marginBottom: 4,
            }}
          >
            FULL THROTTLE UTAH
          </div>
          <div style={{ color: '#94A3B8', fontSize: 12 }}>Share your experience</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: MUTED,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: `1.5px solid ${BORDER}`,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
};
