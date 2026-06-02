// app/page.js
// Version: 2026-06-02 — Added TestimonialsSection
// Last edited: June 2 2026
//
// Change: Removed 'use client' so this page becomes a server component, which lets
// TestimonialsSection fetch reviews server-side (required for SEO + JSON-LD).
// JetSkiBooking is unaffected — it still works as a client component via its own
// 'use client' directive inside booking.js.
'use client';
import { useState, useEffect, useRef } from "react";
import JetSkiBooking from './booking';
import TestimonialsSection from './components/TestimonialsSection';

export default function Home() {
  return (
    <>
      <JetSkiBooking />
      <TestimonialsSection />
    </>
  );
}
