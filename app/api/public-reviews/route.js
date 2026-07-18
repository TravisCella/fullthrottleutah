// app/api/public-reviews/route.js
// Version: 2026-06-09 — Refactored to use lib/reviews
// Last edited: June 9 2026
//
// Returns approved + publishable reviews for public display, plus aggregate stats.
// Cached via Next.js `revalidate` so we don't hammer Google Sheets on every request.
//
// Query params (all optional):
//   ?minRating=N     — Only return reviews with rating >= N (e.g. minRating=5)
//   ?limit=N         — Cap the number of results (default: no cap)
//   ?location=X      — Filter to a specific lake (case-insensitive contains match)
//
// Response shape:
//   {
//     ok: true,
//     reviews: [...],
//     count: 47,
//     aggregateRating: "4.9",
//     totalRating: 230,
//     ratingBreakdown: { "5": 41, "4": 5, "3": 1, "2": 0, "1": 0 }
//   }
//
// Refactor note: the actual sheet read + stats computation now lives in
// lib/reviews.js so TestimonialsSection can call it directly without making
// an HTTP roundtrip to this endpoint. This route just adds query-param
// filtering and JSON serialization on top.

import { NextResponse } from 'next/server';
import { getPublicReviewsWithStats } from '../../../lib/reviews';

// Next.js will cache this response for 5 minutes (300 seconds).
// Sheets gets hit at most once per 5 min from the public side.
export const revalidate = 300;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const minRating = parseInt(searchParams.get('minRating') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '0', 10);
    const location = (searchParams.get('location') || '').trim().toLowerCase();

    // Pull approved+publishable reviews + aggregate stats from the shared lib
    const data = await getPublicReviewsWithStats();
    let reviews = data.reviews;

    // Apply per-request filters AFTER aggregate stats were computed
    if (minRating > 0) reviews = reviews.filter((r) => r.rating >= minRating);
    if (location) {
      reviews = reviews.filter((r) => (r.location || '').toLowerCase().includes(location));
    }
    if (limit > 0) reviews = reviews.slice(0, limit);

    return NextResponse.json({
      ok: true,
      reviews,
      count: data.count,
      aggregateRating: data.aggregateRating,
      totalRating: data.totalRating,
      ratingBreakdown: data.ratingBreakdown,
    });
  } catch (err) {
    console.error('[public-reviews] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
