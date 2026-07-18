'use client';

// app/deposit-hold-confirmed/page.jsx
// Version: 2026-06-06 — Initial
//
// Public success page the customer lands on after completing a deposit hold
// via Stripe Checkout. Deliberately customer-friendly (no admin chrome) since
// the customer may be on their own phone after Travis texted them the link.
// Sits at /deposit-hold-confirmed (NOT under /admin) so it's not protected.

import { useEffect, useState } from 'react';

export default function DepositHoldConfirmed() {
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setSessionId(params.get('session') || '');
    } catch (_) {}
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B1120',
        padding: 20,
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '40px 28px 32px',
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            fontSize: 56,
            marginBottom: 16,
          }}
        >
          ✅
        </div>

        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            marginBottom: 12,
            color: '#0F172A',
            letterSpacing: '-0.02em',
          }}
        >
          Deposit hold confirmed
        </h1>

        <p
          style={{
            fontSize: 15,
            color: '#475569',
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          Your refundable security deposit hold has been placed successfully. Your card will{' '}
          <strong>not be charged</strong> unless damage is documented after your rental.
        </p>

        <div
          style={{
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: 12,
            padding: 16,
            marginBottom: 24,
            textAlign: 'left',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#0C4A6E',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 8,
            }}
          >
            What happens next?
          </div>
          <ul
            style={{
              fontSize: 13,
              color: '#0F172A',
              lineHeight: 1.7,
              paddingLeft: 18,
              margin: 0,
            }}
          >
            <li>The hold appears on your card statement but is not a real charge</li>
            <li>
              After your rental returns clean, the hold is released — funds reappear within 5–10
              business days depending on your bank
            </li>
            <li>If damage is documented, you'll be contacted before any capture</li>
          </ul>
        </div>

        <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.6, marginBottom: 4 }}>
          Questions or concerns?
        </p>
        <p style={{ fontSize: 14, color: '#0F172A', fontWeight: 600 }}>
          Travis —{' '}
          <a href="tel:+18015481273" style={{ color: '#EA580C', textDecoration: 'none' }}>
            (801) 548-1273
          </a>
        </p>

        {sessionId && (
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid #F1F5F9',
              fontSize: 10,
              color: '#94A3B8',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
            }}
          >
            Ref: {sessionId}
          </div>
        )}
      </div>
    </div>
  );
}
