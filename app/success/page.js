'use client'
import { useEffect, useState } from 'react';

export default function SuccessPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F0F9FF 0%, #fff 100%)',
      fontFamily: "'Outfit', sans-serif",
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🌊</div>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 32, fontWeight: 700, margin: 0,
          color: '#0F172A', letterSpacing: '-0.03em',
        }}>
          Booking Confirmed!
        </h1>
        <p style={{ fontSize: 15, color: '#64748B', marginTop: 12, lineHeight: 1.6 }}>
          Your deposit has been received. Check your email for a confirmation and your digital waiver link.
        </p>

        <div style={{
          marginTop: 28, background: '#fff', borderRadius: 16,
          padding: 24, textAlign: 'left',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            Before Your Rental
          </div>
          {[
            { num: '1', text: 'Sign the digital waiver (link in your confirmation email)' },
            { num: '2', text: 'Arrive at Farmington pickup point by 8:00 AM on your rental day' },
            { num: '3', text: "Bring valid driver's license, proof of insurance, and a 2\" ball hitch" },
            { num: '4', text: 'Pay remaining balance + $1,000 security deposit at pickup' },
          ].map(s => (
            <div key={s.num} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: '#0C4A6E',
                color: '#fff', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{s.num}</div>
              <span style={{ fontSize: 14, color: '#475569', lineHeight: 1.5, paddingTop: 3 }}>{s.text}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, padding: 16, background: '#FEF3C7', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
            <strong>Questions?</strong> Text or call us and we will get you sorted out.
          </div>
        </div>

        <a href="/" style={{
          display: 'inline-block', marginTop: 24,
          padding: '14px 28px', borderRadius: 12,
          background: '#0C4A6E', color: '#fff',
          fontSize: 14, fontWeight: 700, textDecoration: 'none',
          fontFamily: "'Outfit', sans-serif",
        }}>
          Back to Full Throttle Utah
        </a>
      </div>
    </div>
  );
}
