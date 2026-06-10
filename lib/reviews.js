// lib/reviews.js
// Version: 2026-06-09 — Shared reviews data layer
// Created: June 9 2026
//
// This module is the single source of truth for "what does a public review look
// like." It's imported by:
//   - app/api/public-reviews/route.js  (returns JSON for browser clients)
//   - app/components/TestimonialsSection.jsx  (renders directly, no HTTP)
//   - app/reviews/page.jsx  (if it adopts this pattern too)
//
// WHY THIS EXISTS:
// Previously TestimonialsSection HTTP-fetched its own /api/public-reviews
// endpoint. That pattern is fragile in serverless environments — URL resolution,
// deployment protection, ISR cache state, and build-time vs runtime timing all
// conspire to break it. By having the component import this module directly,
// we eliminate the HTTP roundtrip entirely. Data flows in-process.

import { getReviews } from './sheets';

/**
 * Reads approved + publishable reviews from the Sheet and computes aggregate
 * stats. Strips private fields before returning.
 *
 * Returns:
 *   {
 *     reviews: [{ review_id, rating, review_text, display_name, location,
 *                 package, timestamp_submitted }, ...],
 *     count: number,
 *     totalRating: number,
 *     aggregateRating: string (e.g. "4.9"),
 *     ratingBreakdown: { "1": n, "2": n, "3": n, "4": n, "5": n }
 *   }
 */
export async function getPublicReviewsWithStats() {
  const reviews = await getReviews({
    status: 'approved',
    allowPublishOnly: true,
  });

  // Aggregate stats are computed across ALL approved+publishable reviews
  // (before any per-request filtering by caller)
  const count = reviews.length;
  const totalRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
  const avg = count > 0 ? totalRating / count : 0;
  const aggregateRating = count > 0 ? avg.toFixed(1) : '0.0';

  const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    if (ratingBreakdown[r.rating] !== undefined) ratingBreakdown[r.rating]++;
  }

  // Strip private fields (private_note, moderator_notes, customer email/phone,
  // etc) before returning. Only these fields should ever be exposed publicly.
  const safeReviews = reviews.map(r => ({
    review_id: r.review_id,
    rating: r.rating,
    review_text: r.review_text,
    display_name: r.display_name,
    location: r.location,
    package: r.package,
    timestamp_submitted: r.timestamp_submitted,
  }));

  return {
    reviews: safeReviews,
    count,
    totalRating,
    aggregateRating,
    ratingBreakdown,
  };
}
