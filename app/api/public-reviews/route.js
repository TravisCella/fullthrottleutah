// app/api/public-reviews/route.js
// Version: 2026-06-02 — Public reviews API
// Created: June 2 2026
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

import { NextResponse } from 'next/server';
import { getReviews } from '../../../lib/sheets';

// Next.js will cache this response for 5 minutes (300 seconds).
// Sheets gets hit at most once per 5 min from the public side.
export const revalidate = 300;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const minRating = parseInt(searchParams.get('minRating') || '0', 10);
    const limit = parseInt(searchParams.get('limit') || '0', 10);
    const location = (searchParams.get('location') || '').trim().toLowerCase();

    // Public reviews = approved AND customer opted in to publish
    let reviews = await getReviews({
      status: 'approved',
      allowPublishOnly: true,
    });

    // Compute aggregate stats from ALL public reviews (before per-request filtering)
    const count = reviews.length;
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avg = count > 0 ? totalRating / count : 0;
    const aggregateRating = count > 0 ? avg.toFixed(1) : '0.0';

    const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of reviews) {
      if (ratingBreakdown[r.rating] !== undefined) ratingBreakdown[r.rating]++;
    }

    // Apply per-request filters AFTER aggregate stats
    if (minRating > 0) reviews = reviews.filter(r => r.rating >= minRating);
    if (location) {
      reviews = reviews.filter(r => (r.location || '').toLowerCase().includes(location));
    }
    if (limit > 0) reviews = reviews.slice(0, limit);

    // Strip private fields before exposing publicly
    const safeReviews = reviews.map(r => ({
      review_id: r.review_id,
      rating: r.rating,
      review_text: r.review_text,
      display_name: r.display_name,
      location: r.location,
      package: r.package,
      timestamp_submitted: r.timestamp_submitted,
    }));

    return NextResponse.json({
      ok: true,
      reviews: safeReviews,
      count,
      aggregateRating,
      totalRating,
      ratingBreakdown,
    });
  } catch (err) {
    console.error('[public-reviews] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
