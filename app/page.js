// app/page.js
// Version: 2026-06-09 — Actually remove 'use client' (was left over from prior edit)
// Last edited: June 9 2026
//
// Bug fix: The June 2 edit's header comment claimed `'use client'` was removed
// to convert this to a server component (required for TestimonialsSection to
// async-fetch reviews server-side). But the directive was never actually deleted
// from the file. As a result, TestimonialsSection — an async server component —
// silently failed to render on the home page. Reviews were correctly approved in
// the Sheet and the API was working; the only broken layer was display.
//
// Fix: actually remove the 'use client' directive and the unused React hook
// imports that were left over from the original client-side iteration.
//
// JetSkiBooking still works fine — booking.js has its own 'use client'
// directive at the top, so the client/server boundary is handled at that
// component, not at the page level.

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
