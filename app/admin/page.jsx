'use client';

// app/admin/page.jsx
// Version: 2026-06-18 — Checkout deep-link: Inspect app → admin return flow
// Last edited: June 18 2026
//
// Changes:
//   1. INSPECT DEEP LINK — "Open Inspection App" link moved into the
//      rentalStatus==='booked' panel only (not shown for picked_up/returned).
//      href now carries ?sid, ?mode=checkout, and a ?returnUrl that brings
//      Inspect back to /admin?focus={sessionId}&checkedOut=1[&inspectionId=X].
//      Label changed to "Check Out — Open Inspection →".
//
//   2. DEEP-LINK RETURN HANDLING — on load, reads focus / checkedOut /
//      inspectionId from the URL. When present: auto-opens the matching
//      booking panel, shows a persistent toast banner, visually pulses the
//      "Place Card Hold" button. URL params are stripped immediately via
//      history.replaceState so a hard refresh doesn't re-fire the toast.
//
//   3. handleChargeDeposit now forwards inspectionId (if stashed in state)
//      to /api/admin/charge-deposit so the PI metadata records which
//      inspection drove this check-out.
//
// Builds on: 2026-06-01 (graceful Stripe state-mismatch handling)
// Prior: 2026-06-17 (inSheet NO SHEET badge)

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Initialized once at module level — avoids recreating the Stripe object on every render.
// NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be live-mode if STRIPE_SECRET_KEY is live-mode
// (and test-mode if test-mode) — a mismatched pair is the classic Elements failure mode.
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Helper — detect Stripe state-mismatch errors so we can recover gracefully
function classifyStripeError(errorMsg) {
  if (!errorMsg || typeof errorMsg !== 'string') return null;
  const m = errorMsg.toLowerCase();
  if (m.includes('status of canceled') || m.includes('status of `canceled`')) {
    return 'already_canceled';
  }
  if (m.includes('status of succeeded') || m.includes('status of `succeeded`') || m.includes('already been captured')) {
    return 'already_captured';
  }
  return null;
}

// ── Backup Card Modal ──────────────────────────────────────────────────────────
// Must be a child of <Elements> (rendered in AdminPage's return) to use
// useStripe / useElements. Card number is collected inside a Stripe-hosted iframe
// — raw PAN never reaches this component or our servers.
function BackupCardModal({ booking, password, onSuccess, onClose }) {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState(null);
  const [initError, setInitError] = useState('');
  const [cardError, setCardError] = useState('');
  const [processing, setProcessing] = useState(false);

  // Create the SetupIntent on mount and get the client_secret.
  useEffect(() => {
    fetch('/api/admin/create-setup-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: booking.sessionId, password }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) setInitError(data.error);
        else setClientSecret(data.clientSecret);
      })
      .catch(() => setInitError('Network error — could not initialize card entry.'));
  }, []);

  const handleSubmit = async () => {
    if (!stripe || !elements || !clientSecret || processing) return;
    setProcessing(true);
    setCardError('');

    const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: elements.getElement(CardElement) },
    });

    if (error) {
      // Card declined, network error, etc. — show inline and let operator retry.
      setCardError(error.message || 'Card declined. Try a different card.');
      setProcessing(false);
      return;
    }

    // SetupIntent confirmed — pm_ is now attached to the customer.
    // Hand it back to AdminPage which will call charge-deposit with it.
    onSuccess(setupIntent.payment_method);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,17,32,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0F172A' }}>Add Backup Card</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94A3B8', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, margin: '0 0 20px' }}>
          Enter the customer's alternate card. The number goes directly to Stripe — it never touches this app.
        </p>

        {initError && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{initError}</div>
        )}

        {!initError && !clientSecret && (
          <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Initializing…</div>
        )}

        {clientSecret && (
          <>
            <div style={{ border: '2px solid #E2E8F0', borderRadius: 10, padding: '14px 12px', marginBottom: 12, background: '#F8FAFC' }}>
              <CardElement options={{ style: { base: { fontSize: '15px', color: '#0F172A', '::placeholder': { color: '#94A3B8' } } } }} />
            </div>

            {cardError && (
              <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
                {cardError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={processing || !stripe}
              style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: '#0C4A6E', color: '#fff', fontSize: 15, fontWeight: 700, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing || !stripe ? 0.6 : 1 }}
            >
              {processing ? 'Processing…' : 'Save Card & Place Hold'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [captureAmount, setCaptureAmount] = useState('');
  const [damageReason, setDamageReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [hideTests, setHideTests] = useState(true);

  // Deep-link state — set from URL params on load, cleared after deposit hold is placed
  const [pendingInspectionToast, setPendingInspectionToast] = useState(null); // { sessionId, renterName }
  const [inspectionId, setInspectionId] = useState(null);
  const [deepLinkParams, setDeepLinkParams] = useState(null);

  // Booking reset confirmation state
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Cancellation confirmation state
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Return deep-link state — set when Inspect redirects back after a return inspection
  const [pendingReturnToast, setPendingReturnToast] = useState(null); // { sessionId, renterName }

  // Backup card flow — code tracks which decline type triggered the button
  const [actionErrorCode, setActionErrorCode] = useState(null);
  const [showBackupCardModal, setShowBackupCardModal] = useState(false);

  // Check for saved password on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('ftu_admin_pass');
    if (saved) {
      setPassword(saved);
      handleLogin(saved);
    }
  }, []);

  // Parse deep-link URL params on mount and strip them immediately so a
  // refresh doesn't re-fire the toast. Actual booking panel open happens
  // in the effect below once bookings have loaded.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get('focus');
    if (!focus) return;
    const checkedOut = params.get('checkedOut');
    const returned = params.get('returned');
    const inspId = params.get('inspectionId');
    if (inspId) setInspectionId(inspId);
    setDeepLinkParams({ focus, checkedOut, returned, inspectionId: inspId });
    history.replaceState(null, '', window.location.pathname);
  }, []);

  // Once bookings are loaded and deep-link params are stashed, open the
  // matching booking panel and set the toast. Clears deepLinkParams so
  // this only fires once even if bookings are refreshed later.
  useEffect(() => {
    if (!deepLinkParams || !bookings.length) return;
    const { focus, checkedOut, returned } = deepLinkParams;
    const booking = bookings.find(b => b.sessionId === focus);
    if (!booking) return;
    setSelectedBooking(booking);
    setActionError(null);
    setActionSuccess(null);
    setCaptureAmount('');
    setDamageReason('');
    setReturnNotes('');
    if (checkedOut === '1') {
      setPendingInspectionToast({ sessionId: focus, renterName: booking.renterName });
    }
    if (returned === '1') {
      setPendingReturnToast({ sessionId: focus, renterName: booking.renterName });
    }
    setDeepLinkParams(null);
  }, [bookings, deepLinkParams]);

  const handleLogin = async (pwd) => {
    const pwdToUse = pwd || password;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/list-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwdToUse }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        sessionStorage.removeItem('ftu_admin_pass');
      } else {
        setBookings(data.bookings || []);
        setAuthed(true);
        sessionStorage.setItem('ftu_admin_pass', pwdToUse);
      }
    } catch (err) {
      setError('Connection error. Try again.');
    }
    setLoading(false);
  };

  const refreshBookings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/list-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, bust: true }),
      });
      const data = await res.json();
      if (data.bookings) setBookings(data.bookings);
    } catch {}
    setLoading(false);
  };

  const handleChargeDeposit = async (booking, paymentMethodId = null) => {
    setActionLoading(true);
    setActionError(null);
    setActionErrorCode(null);
    setActionSuccess(null);
    try {
      const body = { sessionId: booking.sessionId, password };
      if (inspectionId) body.inspectionId = inspectionId;
      if (paymentMethodId) body.paymentMethodId = paymentMethodId;
      const res = await fetch('/api/admin/charge-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
        setActionErrorCode(data.code || null);
      } else {
        setActionSuccess(`✅ $${(data.depositAmount || 1000).toLocaleString()} held on card ending in ${data.cardLast4}`);
        setPendingInspectionToast(null);
        setInspectionId(null);
        await refreshBookings();
        setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); }, 2500);
      }
    } catch (err) {
      setActionError('Connection error');
    }
    setActionLoading(false);
  };

  const handleBackupCardSuccess = async (pmId) => {
    setShowBackupCardModal(false);
    await handleChargeDeposit(selectedBooking, pmId);
  };

  const handleCashDeposit = async (booking) => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch('/api/admin/update-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: booking.paymentIntentId,
          action: 'cash_deposit_received',
          password
        }),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
      } else {
        setActionSuccess('💵 Cash deposit recorded');
        await refreshBookings();
        setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); }, 2000);
      }
    } catch (err) {
      setActionError('Connection error');
    }
    setActionLoading(false);
  };

  // Helper used by both release and capture paths to mark the rental complete
  // when we discover Stripe state was changed externally (in the Dashboard).
  const markReturnedInBackend = async (booking, notes) => {
    try {
      await fetch('/api/admin/update-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: booking.paymentIntentId,
          action: 'mark_returned',
          password,
          notes: notes || 'Marked returned after external Stripe action',
        }),
      });
    } catch (e) {
      console.warn('mark_returned follow-up failed:', e);
    }
  };

  const handleReleaseHold = async (booking) => {
    const dep = booking.packageName?.includes('GTX') ? 2000 : 1000;
    if (!confirm(`Release the $${dep.toLocaleString()} hold? This refunds the customer entirely.`)) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/refund-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdId: booking.securityDepositHoldId,
          action: 'release',
          password
        }),
      });
      const data = await res.json();

      if (data.error) {
        // ── GRACEFUL RECOVERY for external Stripe action ──
        const stripeState = classifyStripeError(data.error);

        if (stripeState === 'already_canceled') {
          // Hold was already released — likely in the Stripe Dashboard.
          // Treat as success: mark the rental returned so this booking doesn't
          // get stuck showing "OUT · CARD HOLD" forever.
          await markReturnedInBackend(booking, returnNotes || 'Hold released in Stripe Dashboard');
          setActionSuccess('✅ Hold was already released in Stripe. Rental marked complete.');
          await refreshBookings();
          setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); }, 3000);
          setActionLoading(false);
          return;
        }

        if (stripeState === 'already_captured') {
          // Hold was already captured (charged) in Stripe. Mark rental returned
          // but flag it differently so Travis knows the deposit was kept.
          await markReturnedInBackend(booking, returnNotes || 'Hold captured in Stripe Dashboard');
          setActionSuccess('⚠️ Hold was already captured in Stripe (deposit was charged). Rental marked complete.');
          await refreshBookings();
          setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); }, 3500);
          setActionLoading(false);
          return;
        }

        // Anything else — show the raw error as before
        setActionError(data.error);
        setActionLoading(false);
        return;
      }

      // Normal success path
      await markReturnedInBackend(booking, returnNotes || 'Clean return');
      setPendingReturnToast(null);
      setActionSuccess('✅ Hold released — customer charged $0');
      await refreshBookings();
      setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); }, 2500);
    } catch (err) {
      setActionError('Connection error');
    }
    setActionLoading(false);
  };

  const handleCaptureHold = async (booking) => {
    const dep = booking.packageName?.includes('GTX') ? 2000 : 1000;
    const amount = parseFloat(captureAmount);
    if (!amount || amount < 1 || amount > dep) {
      setActionError(`Enter a valid amount between $1 and $${dep.toLocaleString()}`);
      return;
    }
    if (!damageReason.trim()) {
      setActionError('Please describe the damage');
      return;
    }
    if (!confirm(`Charge $${amount} from the deposit? Remaining $${dep - amount} will be released back to the customer.`)) return;

    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/refund-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdId: booking.securityDepositHoldId,
          action: 'capture',
          captureAmount: amount,
          damageReason,
          password
        }),
      });
      const data = await res.json();

      if (data.error) {
        const stripeState = classifyStripeError(data.error);

        if (stripeState === 'already_canceled') {
          // The hold is gone — we can't capture from it. Tell Travis clearly.
          setActionError('⚠️ Hold was already released (likely in Stripe Dashboard). Can\'t capture from a released hold. To charge for damage, create a new charge in Stripe using the customer\'s saved card.');
          setActionLoading(false);
          return;
        }

        if (stripeState === 'already_captured') {
          // The capture already happened externally — just mark the rental complete.
          await markReturnedInBackend(booking, `Capture already done in Stripe: ${damageReason}`);
          setActionSuccess('✅ Hold was already captured in Stripe. Rental marked complete.');
          await refreshBookings();
          setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); setCaptureAmount(''); setDamageReason(''); }, 3000);
          setActionLoading(false);
          return;
        }

        setActionError(data.error);
        setActionLoading(false);
        return;
      }

      // Normal success path
      await markReturnedInBackend(booking, `Damage: ${damageReason} ($${amount})`);
      setPendingReturnToast(null);
      setActionSuccess(`✅ Captured $${amount} · $${dep - amount} released`);
      await refreshBookings();
      setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); setCaptureAmount(''); setDamageReason(''); }, 3000);
    } catch (err) {
      setActionError('Connection error');
    }
    setActionLoading(false);
  };

  const handleCashReturn = async (booking) => {
    if (!confirm('Mark cash deposit returned to customer?')) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/update-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: booking.paymentIntentId,
          action: 'cash_deposit_returned',
          password,
          notes: returnNotes || 'Cash returned',
        }),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
      } else {
        setPendingReturnToast(null);
        setActionSuccess('💵 Cash deposit returned, rental closed');
        await refreshBookings();
        setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); }, 2500);
      }
    } catch (err) {
      setActionError('Connection error');
    }
    setActionLoading(false);
  };

  const handleCancelBooking = async (booking) => {
    setCancelConfirmOpen(false);
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch('/api/admin/cancel-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: booking.sessionId, password }),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
      } else {
        const sheetNote = data.sheetUpdated ? '' : ' (Sheets row not found — mark manually)';
        setActionSuccess(`✅ Refunded $${data.amountRefunded?.toLocaleString()} · Booking cancelled${sheetNote}`);
        await refreshBookings();
        setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); }, 3500);
      }
    } catch {
      setActionError('Connection error');
    }
    setActionLoading(false);
  };

  const handleResetToBooked = async (booking) => {
    setResetConfirmOpen(false);
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch('/api/admin/update-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: booking.paymentIntentId, action: 'reset_to_booked', password }),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
      } else {
        setActionSuccess('↩ Booking reset — status reverted to Upcoming');
        await refreshBookings();
        setTimeout(() => { setSelectedBooking(null); setActionSuccess(null); }, 2500);
      }
    } catch {
      setActionError('Connection error');
    }
    setActionLoading(false);
  };

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1120', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Full Throttle Admin</div>
            <div style={{ fontSize: 13, color: '#64748B' }}>Enter password to continue</div>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Password"
            style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '2px solid #E2E8F0', fontSize: 15, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }}
          />
          {error && <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <button
            onClick={() => handleLogin()}
            disabled={loading || !password}
            style={{ width: '100%', padding: '14px', borderRadius: 10, border: 'none', background: '#0C4A6E', color: '#fff', fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading || !password ? 0.5 : 1 }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </div>
      </div>
    );
  }

  const statusBadge = (booking) => {
    const status = booking.rentalStatus;
    const depStatus = booking.securityDepositStatus;

    if (status === 'cancelled') {
      return { label: 'CANCELLED', color: '#6B7280', bg: 'rgba(107,114,128,0.1)' };
    }
    if (status === 'returned') {
      return { label: 'COMPLETED', color: '#16A34A', bg: 'rgba(22,163,74,0.1)' };
    }
    if (status === 'picked_up') {
      if (depStatus === 'held') return { label: 'OUT · CARD HOLD', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' };
      if (depStatus === 'cash_held') return { label: 'OUT · CASH HELD', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' };
      return { label: 'OUT', color: '#0EA5E9', bg: 'rgba(14,165,233,0.1)' };
    }

    const today = new Date(); today.setHours(0,0,0,0);
    const startDate = booking.startDate ? new Date(booking.startDate + ' ' + new Date().getFullYear()) : null;

    return { label: 'UPCOMING', color: '#D97706', bg: 'rgba(217,119,6,0.1)' };
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'system-ui, sans-serif', paddingBottom: 40 }}>
      {/* Keyframes — only inject when the relevant deep-link is active */}
      {(pendingInspectionToast || pendingReturnToast) && (
        <style>{`
          @keyframes ftu-hold-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(14,165,233,0.6); }
            50%       { box-shadow: 0 0 0 8px rgba(14,165,233,0); }
          }
          .ftu-hold-pulse { animation: ftu-hold-pulse 1.4s ease-in-out 4; }
          @keyframes ftu-return-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.6); }
            50%       { box-shadow: 0 0 0 8px rgba(22,163,74,0); }
          }
          .ftu-return-pulse { animation: ftu-return-pulse 1.4s ease-in-out 4; }
        `}</style>
      )}

      {/* Checkout-inspection toast */}
      {pendingInspectionToast && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60,
          background: '#0C4A6E', color: '#fff',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
            ✅ Inspection complete for {pendingInspectionToast.renterName} — place the deposit hold to finish check-out.
          </span>
          <button
            onClick={() => setPendingInspectionToast(null)}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>
      )}

      {/* Return-inspection toast — stacks below checkout toast if both are active */}
      {pendingReturnToast && (
        <div style={{
          position: 'fixed', top: pendingInspectionToast ? 52 : 0, left: 0, right: 0, zIndex: 59,
          background: '#166534', color: '#fff',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
            ✅ Return inspection complete for {pendingReturnToast.renterName} — settle the security deposit below.
          </span>
          <button
            onClick={() => setPendingReturnToast(null)}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>
      )}

      <div style={{ background: '#0B1120', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: (pendingInspectionToast ? 52 : 0) + (pendingReturnToast ? 52 : 0) }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Full Throttle Admin</div>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>{bookings.length} bookings · {bookings.filter(b => b.rentalStatus !== 'returned').length} active</div>
        </div>
        <button onClick={refreshBookings} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      <div style={{ padding: '16px 16px 0' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="🔍 Search by name, email, lake, date..."
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', background: '#fff' }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'out', label: 'Out' },
            { id: 'completed', label: 'Completed' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: '6px 14px', borderRadius: 20,
                border: statusFilter === f.id ? '1.5px solid #0C4A6E' : '1.5px solid #E2E8F0',
                background: statusFilter === f.id ? '#0C4A6E' : '#fff',
                color: statusFilter === f.id ? '#fff' : '#475569',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{f.label}</button>
          ))}
          <button
            onClick={() => setHideTests(!hideTests)}
            style={{
              padding: '6px 14px', borderRadius: 20,
              border: '1.5px solid #E2E8F0',
              background: hideTests ? '#F1F5F9' : '#FEF3C7',
              color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap', marginLeft: 'auto',
            }}
          >{hideTests ? '🧪 Show tests' : '🧪 Hide tests'}</button>
        </div>
      </div>

      <div style={{ padding: '12px 16px 40px' }}>
        {bookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div>No bookings yet</div>
          </div>
        )}

        {bookings
          .filter(b => {
            if (hideTests && b.isTestBooking) return false;
            if (statusFilter !== 'all') {
              const s = b.rentalStatus;
              if (statusFilter === 'upcoming' && s !== 'booked') return false;
              if (statusFilter === 'out' && s !== 'picked_up') return false;
              if (statusFilter === 'completed' && s !== 'returned') return false;
            }
            if (searchQuery.trim()) {
              const q = searchQuery.toLowerCase();
              const hay = [b.renterName, b.renterEmail, b.renterPhone, b.location, b.packageName, b.startDate, b.endDate].join(' ').toLowerCase();
              if (!hay.includes(q)) return false;
            }
            return true;
          })
          .map(b => {
          const badge = statusBadge(b);
          return (
            <div
              key={b.sessionId}
              onClick={() => { setSelectedBooking(b); setActionError(null); setActionErrorCode(null); setActionSuccess(null); setCaptureAmount(''); setDamageReason(''); setReturnNotes(''); setResetConfirmOpen(false); setCancelConfirmOpen(false); setShowBackupCardModal(false); }}
              style={{
                background: '#fff',
                borderRadius: 14,
                padding: 16,
                marginBottom: 10,
                cursor: 'pointer',
                border: '1px solid #E2E8F0',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.renterName}</div>
                    {b.isTestBooking && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em' }}>TEST</span>
                    )}
                    {b.inSheet === false && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#991B1B', background: '#FEE2E2', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em', flexShrink: 0 }}>⚠ NO SHEET</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{b.packageName || '—'} {b.location ? `· ${b.location}` : ''}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.bg, padding: '4px 8px', borderRadius: 6, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {badge.label}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748B', flexWrap: 'wrap' }}>
                <span>📅 {b.startDate || 'No date'}{b.endDate && b.endDate !== b.startDate ? ` → ${b.endDate}` : ''}</span>
                <span>· {b.days} day{b.days > 1 ? 's' : ''}</span>
                <span>· ${b.totalPaid}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Booking Detail Modal */}
      {selectedBooking && (
        <div
          onClick={() => !actionLoading && (setSelectedBooking(null), setResetConfirmOpen(false), setCancelConfirmOpen(false), setShowBackupCardModal(false), setActionErrorCode(null))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,17,32,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: 0 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontSize: 19, fontWeight: 700 }}>{selectedBooking.renterName}</div>
                <button onClick={() => { setSelectedBooking(null); setResetConfirmOpen(false); setCancelConfirmOpen(false); setShowBackupCardModal(false); setActionErrorCode(null); }} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#94A3B8', padding: 0 }}>×</button>
              </div>
              <div style={{ fontSize: 13, color: '#64748B' }}>{selectedBooking.packageName} · {selectedBooking.location}</div>
            </div>

            <div style={{ padding: 20 }}>
              {/* Booking Details */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Booking Details</div>
                {[
                  ['Email', selectedBooking.renterEmail],
                  ['Phone', selectedBooking.renterPhone],
                  ['Dates', `${selectedBooking.startDate}${selectedBooking.endDate !== selectedBooking.startDate ? ` → ${selectedBooking.endDate}` : ''}`],
                  ['Days', selectedBooking.days],
                  ['Experience', selectedBooking.experience],
                  ['Total Paid', `$${selectedBooking.totalPaid}`],
                  ['White Glove', selectedBooking.whiteGlove ? 'Yes (+$200)' : 'No'],
                  ['Lake Powell', selectedBooking.isLakePowell ? 'Yes — decon required' : 'No'],
                  ['Waiver Signed', selectedBooking.waiverSigned ? '✓ Yes' : '✗ No'],
                ].filter(([_, v]) => v !== undefined && v !== '').map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F1F5F9', fontSize: 13 }}>
                    <span style={{ color: '#64748B' }}>{k}</span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Action Status Messages */}
              {actionError && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{actionError}</div>
              )}
              {actionSuccess && (
                <div style={{ background: '#DCFCE7', color: '#166534', padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{actionSuccess}</div>
              )}

              {/* PICKUP ACTIONS - if booking is "booked" status */}
              {selectedBooking.rentalStatus === 'booked' && !actionSuccess && (() => {
                const depAmt = selectedBooking.packageName?.includes('GTX') ? 2000 : 1000;
                const depLabel = `$${depAmt.toLocaleString()}`;
                const isCheckoutFocus = pendingInspectionToast?.sessionId === selectedBooking.sessionId;
                return (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Pickup — Security Deposit</div>

                  <button
                    className={isCheckoutFocus ? 'ftu-hold-pulse' : undefined}
                    onClick={() => handleChargeDeposit(selectedBooking)}
                    disabled={actionLoading}
                    style={{
                      width: '100%', padding: 16, borderRadius: 12, border: 'none',
                      background: isCheckoutFocus ? '#0369A1' : '#0C4A6E',
                      color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                      marginBottom: 10, opacity: actionLoading ? 0.5 : 1,
                    }}
                  >
                    {actionLoading ? 'Processing...' : `💳 Place ${depLabel} Card Hold`}
                  </button>

                  <button
                    onClick={() => handleCashDeposit(selectedBooking)}
                    disabled={actionLoading}
                    style={{ width: '100%', padding: 16, borderRadius: 12, border: '2px solid #16A34A', background: '#fff', color: '#16A34A', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: actionLoading ? 0.5 : 1 }}
                  >
                    💵 Cash Deposit Received ({depLabel})
                  </button>

                  {/* Backup card — shown ONLY after a card-decline error on this booking.
                      Never visible on a normal pickup; operator reaches for it only when
                      a hold actually failed. */}
                  {actionError && ['card_declined', 'insufficient_funds', 'expired_card', 'processing_error'].includes(actionErrorCode) && (
                    <button
                      onClick={() => setShowBackupCardModal(true)}
                      disabled={actionLoading}
                      style={{ width: '100%', padding: 14, borderRadius: 10, border: '2px solid #0C4A6E', background: '#fff', color: '#0C4A6E', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 10, opacity: actionLoading ? 0.5 : 1 }}
                    >
                      💳 Add backup card
                    </button>
                  )}

                  {/* Deep-link: Check Out button — opens Inspect with booking context */}
                  <a
                    href={`/inspect?sid=${selectedBooking.sessionId}&mode=checkout&returnUrl=${encodeURIComponent('/admin?focus=' + selectedBooking.sessionId + '&checkedOut=1')}`}
                    style={{ display: 'block', width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#0C4A6E', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 14, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
                  >
                    Check Out — Open Inspection →
                  </a>

                  {/* Cancel booking — two-step confirm, destructive */}
                  <div style={{ marginTop: 20, borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Cancel Booking</div>
                    {!cancelConfirmOpen ? (
                      <button
                        onClick={() => setCancelConfirmOpen(true)}
                        disabled={actionLoading}
                        style={{ width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid #FCA5A5', background: '#FFF1F2', color: '#991B1B', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.5 : 1 }}
                      >
                        Cancel & Refund Customer
                      </button>
                    ) : (
                      <div style={{ background: '#FFF1F2', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 13, color: '#991B1B', fontWeight: 600, marginBottom: 6 }}>
                          Full refund of ${selectedBooking.totalPaid?.toLocaleString()} to customer's card.
                        </div>
                        <div style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 12 }}>
                          Booking will be removed from the date picker. Google Calendar event must be deleted manually.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleCancelBooking(selectedBooking)}
                            disabled={actionLoading}
                            style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: actionLoading ? 0.5 : 1 }}
                          >
                            {actionLoading ? 'Cancelling...' : 'Yes, Cancel & Refund'}
                          </button>
                          <button
                            onClick={() => setCancelConfirmOpen(false)}
                            style={{ flex: 1, padding: 10, borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Keep Booking
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* RETURN ACTIONS - if booking is "picked_up" */}
              {selectedBooking.rentalStatus === 'picked_up' && !actionSuccess && (() => {
                const depAmt = selectedBooking.packageName?.includes('GTX') ? 2000 : 1000;
                const depLabel = `$${depAmt.toLocaleString()}`;
                return (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Return — Handle Deposit</div>

                  {selectedBooking.securityDepositMethod === 'card' && selectedBooking.securityDepositHoldId && (
                    <>
                      <button
                        className={pendingReturnToast?.sessionId === selectedBooking.sessionId ? 'ftu-return-pulse' : undefined}
                        onClick={() => handleReleaseHold(selectedBooking)}
                        disabled={actionLoading}
                        style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: '#16A34A', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10, opacity: actionLoading ? 0.5 : 1 }}
                      >
                        ✓ Release {depLabel} Hold (clean return)
                      </button>

                      <div style={{ background: '#FEF3C7', borderRadius: 12, padding: 14, marginTop: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400E', marginBottom: 10 }}>Or charge for damage:</div>
                        <input
                          type="number"
                          placeholder={`Amount to charge (max ${depLabel})`}
                          value={captureAmount}
                          onChange={e => setCaptureAmount(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #FCD34D', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' }}
                        />
                        <textarea
                          placeholder="Describe the damage..."
                          value={damageReason}
                          onChange={e => setDamageReason(e.target.value)}
                          rows={2}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #FCD34D', fontSize: 13, marginBottom: 10, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                        />
                        <button
                          onClick={() => handleCaptureHold(selectedBooking)}
                          disabled={actionLoading || !captureAmount || !damageReason}
                          style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: actionLoading || !captureAmount || !damageReason ? 0.5 : 1 }}
                        >
                          Charge ${captureAmount || '0'} for damage
                        </button>
                      </div>
                    </>
                  )}

                  {selectedBooking.securityDepositMethod === 'cash' && (
                    <>
                      <textarea
                        placeholder="Return notes (optional)"
                        value={returnNotes}
                        onChange={e => setReturnNotes(e.target.value)}
                        rows={2}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, marginBottom: 10, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                      <button
                        onClick={() => handleCashReturn(selectedBooking)}
                        disabled={actionLoading}
                        style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: '#16A34A', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: actionLoading ? 0.5 : 1 }}
                      >
                        💵 Cash Returned — Close Rental
                      </button>
                    </>
                  )}

                  {/* Deep-link: Return Inspection button — opens Inspect with booking context */}
                  <a
                    href={`/inspect?sid=${selectedBooking.sessionId}&mode=return&returnUrl=${encodeURIComponent('/admin?focus=' + selectedBooking.sessionId + '&returned=1')}`}
                    style={{ display: 'block', width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#166534', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 14, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
                  >
                    Return Inspection →
                  </a>
                </div>
                );
              })()}

              {/* COMPLETED - no actions */}
              {selectedBooking.rentalStatus === 'returned' && (
                <div style={{ background: '#DCFCE7', color: '#166534', padding: 14, borderRadius: 12, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
                  ✓ Rental Complete
                  {selectedBooking.returnTimestamp && (
                    <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4 }}>
                      Returned {new Date(selectedBooking.returnTimestamp).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {/* DANGER ZONE — reset to booked (shown for picked_up or returned) */}
              {selectedBooking.rentalStatus !== 'booked' && !actionSuccess && (
                <div style={{ marginTop: 24, borderTop: '1px solid #E2E8F0', paddingTop: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Admin — Correct a Mistake</div>
                  {!resetConfirmOpen ? (
                    <button
                      onClick={() => setResetConfirmOpen(true)}
                      disabled={actionLoading}
                      style={{ width: '100%', padding: 12, borderRadius: 10, border: '1.5px solid #FCA5A5', background: '#FFF1F2', color: '#991B1B', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: actionLoading ? 0.5 : 1 }}
                    >
                      ↩ Reset to Booked (undo deposit / return)
                    </button>
                  ) : (
                    <div style={{ background: '#FFF1F2', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 13, color: '#991B1B', fontWeight: 600, marginBottom: 10 }}>
                        This clears all deposit and return data from Stripe. Use only to correct a mistake — it cannot be undone automatically.
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleResetToBooked(selectedBooking)}
                          disabled={actionLoading}
                          style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: actionLoading ? 0.5 : 1 }}
                        >
                          {actionLoading ? 'Resetting...' : 'Yes, Reset'}
                        </button>
                        <button
                          onClick={() => setResetConfirmOpen(false)}
                          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Backup card modal — rendered outside the booking detail sheet so it
          sits above everything (z-index 70 > sheet's 50). Elements provider
          wraps it so BackupCardModal can use useStripe / useElements. */}
      {showBackupCardModal && selectedBooking && (
        <Elements stripe={stripePromise}>
          <BackupCardModal
            booking={selectedBooking}
            password={password}
            onSuccess={handleBackupCardSuccess}
            onClose={() => setShowBackupCardModal(false)}
          />
        </Elements>
      )}
    </div>
  );
}
