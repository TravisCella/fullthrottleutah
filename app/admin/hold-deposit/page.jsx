'use client';

// app/admin/hold-deposit/page.jsx
// Version: 2026-06-06 — Initial
//
// Admin page for placing a $1,000 (or custom amount) refundable security
// deposit hold on a DIFFERENT card than the one used to pay the rental.
//
// Flow:
//   1. Travis logs in (sessionStorage 'ftu_admin_pass', same as /admin/reviews)
//   2. Fills out form: customer name, optional email, optional booking link,
//      amount (default $1000), optional notes
//   3. Clicks "Create hold link" → calls /api/admin/create-deposit-hold
//   4. Page shows the Stripe Checkout URL + actions (copy, open, text SMS,
//      email mailto)
//   5. Travis shares URL with customer via text/email/in-person — customer
//      opens it on their device, enters their card on Stripe's hosted page
//   6. Hold appears in the "Recent holds" list below (refresh to see latest)
//
// Capture/release for v1: managed via Stripe Dashboard (each row has an
// "Open in Stripe" link). A future iteration could add inline buttons.

import { useState, useEffect } from 'react';

export default function HoldDepositPage() {
  // ── Auth ────────────────────────────────────────────────────────────
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [loadingLogin, setLoadingLogin] = useState(false);

  // ── Form state ──────────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [amount, setAmount] = useState('1000');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [result, setResult] = useState(null); // {url, sessionId, amount, customerName}

  // ── Recent holds ────────────────────────────────────────────────────
  const [holds, setHolds] = useState([]);
  const [loadingHolds, setLoadingHolds] = useState(false);

  // ── Effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = sessionStorage.getItem('ftu_admin_pass');
    if (saved) {
      setPassword(saved);
      tryLogin(saved);
    }
  }, []);

  useEffect(() => {
    if (authed) loadHolds(password);
  }, [authed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Network ─────────────────────────────────────────────────────────
  async function tryLogin(pwd) {
    setLoadingLogin(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/admin/list-deposit-holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (data.error) {
        setLoginError(data.error);
        setLoadingLogin(false);
        return;
      }
      sessionStorage.setItem('ftu_admin_pass', pwd);
      setAuthed(true);
      setHolds(data.holds || []);
    } catch (err) {
      setLoginError('Network error — try again');
    }
    setLoadingLogin(false);
  }

  async function loadHolds(pwd) {
    setLoadingHolds(true);
    try {
      const res = await fetch('/api/admin/list-deposit-holds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd || password }),
      });
      const data = await res.json();
      if (data.ok) setHolds(data.holds || []);
    } catch (_) {}
    setLoadingHolds(false);
  }

  async function handleCreate() {
    if (!customerName.trim()) {
      setFormError('Customer name is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/create-deposit-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          bookingId: bookingId.trim(),
          amount: parseFloat(amount) || 1000,
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setFormError(data.error || 'Failed to create hold');
        setSubmitting(false);
        return;
      }
      setResult(data);
      // Refresh the holds list so the new awaiting_card row shows up
      loadHolds();
    } catch (err) {
      setFormError('Network error');
    }
    setSubmitting(false);
  }

  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text);
    } catch (_) {}
  }

  function resetForm() {
    setCustomerName('');
    setCustomerEmail('');
    setBookingId('');
    setAmount('1000');
    setNotes('');
    setResult(null);
    setFormError(null);
  }

  // ── Render: login screen ────────────────────────────────────────────
  if (!authed) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B1120',
          padding: 20,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 32,
            width: '100%',
            maxWidth: 380,
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>🔒 Hold Deposit</div>
            <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Enter admin password</div>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tryLogin(password)}
            placeholder="Password"
            style={{
              width: '100%',
              padding: 12,
              border: '1px solid #CBD5E1',
              borderRadius: 10,
              fontSize: 16,
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
            autoFocus
          />
          {loginError && (
            <div
              style={{
                background: '#FEE2E2',
                color: '#991B1B',
                padding: 10,
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {loginError}
            </div>
          )}
          <button
            onClick={() => tryLogin(password)}
            disabled={loadingLogin || !password}
            style={{
              width: '100%',
              padding: 12,
              borderRadius: 10,
              border: 'none',
              background: '#0C4A6E',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: loadingLogin ? 'wait' : 'pointer',
              opacity: loadingLogin || !password ? 0.5 : 1,
            }}
          >
            {loadingLogin ? 'Checking…' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: authed app ──────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        fontFamily: 'system-ui, sans-serif',
        paddingBottom: 60,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#0B1120',
          color: '#fff',
          padding: '18px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>
            🔒 Hold Deposit
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
            Place an authorization hold on a different card
          </div>
        </div>
        <button
          onClick={() => {
            sessionStorage.removeItem('ftu_admin_pass');
            setAuthed(false);
            setPassword('');
          }}
          style={{
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Log out
        </button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
        {/* ─── FORM CARD ───────────────────────────────────────────── */}
        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
            New deposit hold
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16, lineHeight: 1.5 }}>
            Generates a Stripe Checkout link. Share it with the customer — they enter their card on
            Stripe's secure page, and the funds are <strong>held but not charged</strong> until you
            capture or release in the Stripe Dashboard.
          </div>

          <Field label="Customer name *">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Israel Arvanitas"
              style={inputStyle}
            />
          </Field>

          <Field label="Customer email (optional, prefills Stripe Checkout)">
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@example.com"
              style={inputStyle}
            />
          </Field>

          <Field label="Linked booking ID (optional)">
            <input
              type="text"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              placeholder="cs_live_a1cXc..."
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 13 }}
            />
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
              Found in Sheet1 column A. Helps track which rental this hold is for.
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <Field label="Amount ($)">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max="10000"
                step="any"
                style={inputStyle}
              />
            </Field>
            <Field label="Notes (optional)">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Friend paying deposit on behalf of John"
                style={inputStyle}
              />
            </Field>
          </div>

          {formError && (
            <div
              style={{
                background: '#FEE2E2',
                color: '#991B1B',
                padding: 10,
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              ⚠ {formError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreate}
              disabled={submitting || !customerName.trim()}
              style={{
                ...primaryBtn,
                cursor: submitting || !customerName.trim() ? 'not-allowed' : 'pointer',
                opacity: submitting || !customerName.trim() ? 0.5 : 1,
              }}
            >
              {submitting ? 'Creating link…' : '🔗 Create hold link'}
            </button>
            {result && (
              <button onClick={resetForm} style={secondaryBtn}>
                New hold
              </button>
            )}
          </div>
        </div>

        {/* ─── RESULT PANEL ────────────────────────────────────────── */}
        {result && (
          <div
            style={{
              background: '#F0FDF4',
              border: '2px solid #16A34A',
              borderRadius: 14,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 22 }}>✅</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#14532D' }}>
                  Hold link created for {result.customerName}
                </div>
                <div style={{ fontSize: 12, color: '#166534' }}>
                  ${result.amount.toLocaleString()} • Link expires in 24 hours
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #BBF7D0',
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#0F172A',
                wordBreak: 'break-all',
                lineHeight: 1.5,
              }}
            >
              {result.url}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => copyToClipboard(result.url)} style={actionBtn}>
                📋 Copy link
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noopener"
                style={{ ...actionBtn, textDecoration: 'none', display: 'inline-block' }}
              >
                ↗ Open
              </a>
              <a
                href={`sms:?&body=${encodeURIComponent(
                  `Hi ${result.customerName}! Please complete your $${result.amount} refundable security deposit hold for Full Throttle Utah: ${result.url}\n\nYour card will NOT be charged unless damage is documented.`
                )}`}
                style={{ ...actionBtn, textDecoration: 'none', display: 'inline-block' }}
              >
                💬 Text
              </a>
              <a
                href={`mailto:${result.customerEmail || ''}?subject=${encodeURIComponent('Security Deposit Hold — Full Throttle Utah')}&body=${encodeURIComponent(
                  `Hi ${result.customerName},\n\nPlease complete your refundable $${result.amount} security deposit hold here:\n\n${result.url}\n\nYour card will not be charged unless damage is documented after your rental. The hold automatically releases within 7 days.\n\nQuestions? Reply to this email or call (801) 548-1273.\n\nThanks!\nTravis — Full Throttle Utah`
                )}`}
                style={{ ...actionBtn, textDecoration: 'none', display: 'inline-block' }}
              >
                ✉ Email
              </a>
            </div>
          </div>
        )}

        {/* ─── RECENT HOLDS LIST ───────────────────────────────────── */}
        <div
          style={{
            background: '#fff',
            borderRadius: 14,
            padding: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Recent holds</div>
              <div style={{ fontSize: 11, color: '#94A3B8' }}>Last 60 days</div>
            </div>
            <button onClick={() => loadHolds()} style={{ ...actionBtn, padding: '6px 10px' }}>
              {loadingHolds ? '…' : '↻'}
            </button>
          </div>

          {loadingHolds && holds.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>
              Loading…
            </div>
          )}

          {!loadingHolds && holds.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 13 }}>
              No deposit holds yet. Create your first one above.
            </div>
          )}

          {holds.map((h) => (
            <HoldRow key={h.id} hold={h} />
          ))}
        </div>

        {/* ─── HELP / DOCS ─────────────────────────────────────────── */}
        <div
          style={{
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: 10,
            padding: 14,
            marginTop: 20,
            fontSize: 12,
            color: '#0C4A6E',
            lineHeight: 1.6,
          }}
        >
          <strong>💡 How holds work:</strong>
          <br />• Status <em>awaiting_card</em> = customer hasn't paid yet. Link is still valid for
          24h.
          <br />• Status <em>hold_active</em> = funds reserved on customer's card. You have{' '}
          <strong>7 days</strong> to capture or release.
          <br />• Status <em>captured</em> = damaged released the deposit. Charge went through.
          <br />• Status <em>released</em> = funds returned to customer. No charge.
          <br />• Capture or release any active hold from its Stripe Dashboard page (click "Open in
          Stripe" on the row).
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function HoldRow({ hold }) {
  const statusColors = {
    awaiting_card: { bg: '#FEF3C7', fg: '#92400E', label: '⏳ Awaiting card' },
    hold_active: { bg: '#DBEAFE', fg: '#1E40AF', label: '🔒 Hold active' },
    captured: { bg: '#FEE2E2', fg: '#991B1B', label: '💸 Captured' },
    released: { bg: '#DCFCE7', fg: '#166534', label: '✅ Released' },
  };
  const status = statusColors[hold.friendlyStatus] || {
    bg: '#F1F5F9',
    fg: '#475569',
    label: hold.status,
  };
  const created = new Date(hold.createdAt * 1000);
  const createdStr = created.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div
      style={{
        padding: '14px 0',
        borderBottom: '1px solid #F1F5F9',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 5,
                background: status.bg,
                color: status.fg,
                whiteSpace: 'nowrap',
              }}
            >
              {status.label}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
              {hold.customerName || '(no name)'}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
              ${hold.amount.toLocaleString()}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            {createdStr}
            {hold.customerEmail && ` · ${hold.customerEmail}`}
            {hold.linkedBookingId && ` · booking ${hold.linkedBookingId.slice(-8)}`}
          </div>
          {hold.notes && (
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3, fontStyle: 'italic' }}>
              "{hold.notes}"
            </div>
          )}
        </div>
        <a
          href={hold.stripeUrl}
          target="_blank"
          rel="noopener"
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#0C4A6E',
            background: '#fff',
            border: '1px solid #CBD5E1',
            padding: '6px 10px',
            borderRadius: 6,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          Open in Stripe ↗
        </a>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #CBD5E1',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const primaryBtn = {
  flex: 1,
  padding: '12px 16px',
  borderRadius: 10,
  border: 'none',
  background: '#0C4A6E',
  color: '#fff',
  fontSize: 14,
  fontWeight: 600,
};

const secondaryBtn = {
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid #CBD5E1',
  background: '#fff',
  color: '#475569',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

const actionBtn = {
  padding: '7px 12px',
  borderRadius: 7,
  border: '1px solid #CBD5E1',
  background: '#fff',
  color: '#0F172A',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
