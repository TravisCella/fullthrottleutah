'use client';

// app/agreement/[bookingId]/PrintButton.jsx
// Version: 2026-06-06 Phase 3 — Initial
//
// Tiny client-side button that triggers the browser's native print dialog.
// Lives in its own file because the parent page.jsx is a server component
// (it fetches from Google Sheets), and server components cannot use
// onClick handlers. This is the standard Next.js App Router pattern:
// keep most rendering on the server, push the few interactive pieces
// into 'use client' children.

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        background: 'rgba(255,255,255,0.1)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)',
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      🖨️ Print / Save as PDF
    </button>
  );
}
