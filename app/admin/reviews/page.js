'use client';

// app/admin/reviews/page.jsx
// Version: 2026-06-02 — Admin review moderation UI
// Created: June 2 2026
// Reuses the same password (ftu_admin_pass) as the main /admin page via sessionStorage.

import { useState, useEffect } from 'react';

export default function AdminReviewsPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('pending'); // start on the things that need attention
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem('ftu_admin_pass');
    if (saved) {
      setPassword(saved);
      tryLogin(saved);
    }
  }, []);

  useEffect(() => {
    if (authed) loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, filter]);

  async function tryLogin(pwd) {
    setLoadingLogin(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/admin/list-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (data.error) {
        setLoginError(data.error);
        sessionStorage.removeItem('ftu_admin_pass');
      } else {
        setAuthed(true);
        sessionStorage.setItem('ftu_admin_pass', pwd);
      }
    } catch {
      setLoginError('Connection error.');
    }
    setLoadingLogin(false);
  }

  async function loadReviews() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/list-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          statusFilter: filter === 'all' ? null : filter,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setReviews(data.reviews || []);
        setCounts(data.counts || counts);
      }
    } catch {}
    setLoading(false);
  }

  async function moderate(action) {
    if (!selected) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const body = { password, reviewId: selected.review_id, action };
      if (action === 'rename') body.newDisplayName = editingName;

      const res = await fetch('/api/admin/moderate-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setActionError(data.error);
      } else {
        const labels = { approve: 'Approved', reject: 'Rejected', rename: 'Display name updated' };
        setActionSuccess(`✅ ${labels[action] || 'Done'}`);
        await loadReviews();
        setTimeout(() => {
          setSelected(null);
          setActionSuccess(null);
        }, 1800);
      }
    } catch {
      setActionError('Connection error');
    }
    setActionLoading(false);
  }

  // ── LOGIN SCREEN ───────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0B1120',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Review Moderation</div>
            <div style={{ fontSize: 13, color: '#64748B' }}>Enter admin password</div>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tryLogin(password)}
            placeholder="Password"
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 10,
              border: '2px solid #E2E8F0',
              fontSize: 15,
              marginBottom: 12,
              boxSizing: 'border-box',
              outline: 'none',
            }}
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
              padding: '14px',
              borderRadius: 10,
              border: 'none',
              background: '#0C4A6E',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: loadingLogin ? 'not-allowed' : 'pointer',
              opacity: loadingLogin || !password ? 0.5 : 1,
            }}
          >
            {loadingLogin ? 'Logging in...' : 'Login'}
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN UI ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F8FAFC',
        fontFamily: 'system-ui, sans-serif',
        paddingBottom: 40,
      }}
    >
      <div
        style={{
          background: '#0B1120',
          color: '#fff',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>⭐ Review Moderation</div>
          <div style={{ fontSize: 11, color: '#94A3B8' }}>
            {counts.pending} pending · {counts.approved} approved · {counts.total} total
          </div>
        </div>
        <a
          href="/admin"
          style={{
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          ← Bookings
        </a>
      </div>

      {/* Filter tabs */}
      <div style={{ padding: '16px 16px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { id: 'pending', label: `Pending (${counts.pending})` },
          { id: 'approved', label: `Approved (${counts.approved})` },
          { id: 'rejected', label: `Rejected (${counts.rejected})` },
          { id: 'all', label: `All (${counts.total})` },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: filter === f.id ? '1.5px solid #0C4A6E' : '1.5px solid #E2E8F0',
              background: filter === f.id ? '#0C4A6E' : '#fff',
              color: filter === f.id ? '#fff' : '#475569',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={loadReviews}
          style={{
            marginLeft: 'auto',
            padding: '6px 14px',
            borderRadius: 20,
            border: '1.5px solid #E2E8F0',
            background: '#fff',
            color: '#475569',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      {/* Reviews list */}
      <div style={{ padding: '12px 16px 40px' }}>
        {!loading && reviews.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⭐</div>
            <div>No reviews {filter !== 'all' ? `with status "${filter}"` : 'yet'}</div>
          </div>
        )}

        {reviews.map((r) => (
          <ReviewCard
            key={r.review_id}
            review={r}
            onClick={() => {
              setSelected(r);
              setEditingName(r.display_name);
              setActionError(null);
              setActionSuccess(null);
            }}
          />
        ))}
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          onClick={() => !actionLoading && setSelected(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(11,17,32,0.6)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '20px 20px 0 0',
              width: '100%',
              maxWidth: 520,
              maxHeight: '92vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                padding: '20px 20px 16px',
                borderBottom: '1px solid #E2E8F0',
                position: 'sticky',
                top: 0,
                background: '#fff',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <Stars rating={selected.rating} size={20} />
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
                    {selected.display_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    {selected.location} · submitted {formatDate(selected.timestamp_submitted)}
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 24,
                    cursor: 'pointer',
                    color: '#94A3B8',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ padding: 20 }}>
              {/* Status badge */}
              <StatusBadge status={selected.status} />

              {/* Review text */}
              <div
                style={{
                  background: '#F8FAFC',
                  borderRadius: 10,
                  padding: 14,
                  margin: '14px 0',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                "{selected.review_text}"
              </div>

              {/* Private note */}
              {selected.private_note && (
                <div
                  style={{ background: '#FEF3C7', borderRadius: 10, padding: 14, marginBottom: 14 }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#92400E',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 4,
                    }}
                  >
                    🔒 Private note (never published)
                  </div>
                  <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
                    {selected.private_note}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16 }}>
                <Row k="Customer">{selected.customer_name}</Row>
                <Row k="Package">{selected.package}</Row>
                <Row k="Allow publish">{selected.allow_publish ? '✓ Yes' : '✗ No'}</Row>
                <Row k="Booking ID" mono>
                  {selected.booking_id}
                </Row>
                {selected.timestamp_moderated && (
                  <Row k="Moderated">{formatDate(selected.timestamp_moderated)}</Row>
                )}
              </div>

              {/* Edit display name */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                  }}
                >
                  Display name
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    maxLength={80}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #E2E8F0',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => moderate('rename')}
                    disabled={
                      actionLoading || editingName === selected.display_name || !editingName.trim()
                    }
                    style={{
                      padding: '10px 16px',
                      borderRadius: 8,
                      border: '1.5px solid #0C4A6E',
                      background: '#fff',
                      color: '#0C4A6E',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity:
                        actionLoading ||
                        editingName === selected.display_name ||
                        !editingName.trim()
                          ? 0.4
                          : 1,
                    }}
                  >
                    Update
                  </button>
                </div>
              </div>

              {/* Status messages */}
              {actionError && (
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
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div
                  style={{
                    background: '#DCFCE7',
                    color: '#166534',
                    padding: 12,
                    borderRadius: 10,
                    fontSize: 13,
                    marginBottom: 12,
                    fontWeight: 600,
                  }}
                >
                  {actionSuccess}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  onClick={() => moderate('approve')}
                  disabled={actionLoading || selected.status === 'approved'}
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: 'none',
                    background: '#16A34A',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: actionLoading || selected.status === 'approved' ? 0.5 : 1,
                  }}
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => moderate('reject')}
                  disabled={actionLoading || selected.status === 'rejected'}
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: 'none',
                    background: '#DC2626',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: actionLoading || selected.status === 'rejected' ? 0.5 : 1,
                  }}
                >
                  ✕ Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────────
function ReviewCard({ review, onClick }) {
  const statusColors = {
    pending: { color: '#92400E', bg: '#FEF3C7', label: 'PENDING' },
    approved: { color: '#166534', bg: '#DCFCE7', label: 'APPROVED' },
    rejected: { color: '#991B1B', bg: '#FEE2E2', label: 'REJECTED' },
  };
  const s = statusColors[review.status] || statusColors.pending;

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        cursor: 'pointer',
        border: '1px solid #E2E8F0',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Stars rating={review.rating} size={16} />
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{review.display_name}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            {review.location} · {formatDate(review.timestamp_submitted)}
          </div>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: s.color,
            background: s.bg,
            padding: '4px 8px',
            borderRadius: 6,
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
          }}
        >
          {s.label}
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#475569',
          lineHeight: 1.5,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        "{review.review_text}"
      </div>
      {review.private_note && (
        <div style={{ fontSize: 10, color: '#92400E', marginTop: 6, fontWeight: 600 }}>
          🔒 Includes private note
        </div>
      )}
    </div>
  );
}

function Stars({ rating, size = 16 }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          style={{
            fontSize: size,
            color: n <= rating ? '#F59E0B' : '#E2E8F0',
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: { label: 'Pending — needs your decision', bg: '#FEF3C7', color: '#92400E' },
    approved: { label: 'Approved — visible publicly', bg: '#DCFCE7', color: '#166534' },
    rejected: { label: 'Rejected — not displayed', bg: '#FEE2E2', color: '#991B1B' },
  };
  const s = map[status] || map.pending;
  return (
    <div
      style={{
        background: s.bg,
        color: s.color,
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        textAlign: 'center',
      }}
    >
      {s.label}
    </div>
  );
}

function Row({ k, children, mono }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        borderBottom: '1px solid #F1F5F9',
      }}
    >
      <span style={{ color: '#94A3B8' }}>{k}</span>
      <span
        style={{
          fontWeight: 600,
          color: '#0F172A',
          fontFamily: mono ? 'monospace' : 'inherit',
          fontSize: mono ? 11 : 12,
          wordBreak: 'break-all',
          textAlign: 'right',
          marginLeft: 16,
        }}
      >
        {children}
      </span>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
