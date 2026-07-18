// app/api/submit-review/route.js
// Version: 2026-06-02 — Customer-facing review submission
// Created: June 2 2026
//
// Two methods on this endpoint:
//   GET  /api/submit-review?bookingId=XXX   — Fetch booking context + existing review
//                                              status. Used by the form page to
//                                              personalize and detect duplicates.
//   POST /api/submit-review                 — Submit a new review. Rating drives the
//                                              initial status:
//                                                5 stars → 'approved' (auto-publish)
//                                                1-4 stars → 'pending' (owner moderates)
//                                              Owner notified via SMS + email when a
//                                              review needs moderation (low rating).

import { NextResponse } from 'next/server';
import { getBookingById, getReviewByBookingId, addReview } from '../../../lib/sheets';
import { sendSMS } from '../../../lib/sms';

// ─── GET: form context lookup ──────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
    }

    const booking = await getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json(
        {
          error:
            "We couldn't find that booking. Double-check the link in your email — and if it still doesn't work, text us at (801) 548-1273.",
        },
        { status: 404 }
      );
    }

    // Check for an existing review (so we can stop double-submission politely)
    const existing = await getReviewByBookingId(bookingId);

    // Compute a sensible default display name (first name + last initial)
    const nameParts = (booking.renter_name || '').trim().split(/\s+/);
    let suggestedDisplayName = nameParts[0] || '';
    if (nameParts.length >= 2 && nameParts[nameParts.length - 1].length > 0) {
      suggestedDisplayName = `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`;
    }

    return NextResponse.json({
      ok: true,
      booking: {
        booking_id: booking.booking_id,
        package: booking.package,
        location: booking.location,
        start_date: booking.start_date,
        end_date: booking.end_date,
        days: booking.days,
        renter_first_name: nameParts[0] || '',
        renter_name: booking.renter_name,
        suggested_display_name: suggestedDisplayName,
      },
      existing_review: existing
        ? {
            review_id: existing.review_id,
            rating: existing.rating,
            status: existing.status,
            timestamp_submitted: existing.timestamp_submitted,
          }
        : null,
    });
  } catch (err) {
    console.error('[submit-review][GET] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST: submit a review ─────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { bookingId, rating, reviewText, displayName, allowPublish, privateNote } = body;

    // ── Validation ────────────────────────────────────────────────────────
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 });
    }
    const ratingNum = parseInt(rating, 10);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return NextResponse.json({ error: 'Rating must be 1-5 stars' }, { status: 400 });
    }
    if (!reviewText || typeof reviewText !== 'string') {
      return NextResponse.json({ error: 'Review text is required' }, { status: 400 });
    }
    const trimmedText = reviewText.trim();
    if (trimmedText.length < 20) {
      return NextResponse.json(
        { error: 'Review text must be at least 20 characters — tell us what made the trip!' },
        { status: 400 }
      );
    }
    if (trimmedText.length > 2000) {
      return NextResponse.json(
        { error: 'Review text must be 2000 characters or less' },
        { status: 400 }
      );
    }
    if (!displayName || !displayName.trim()) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

    // ── Verify booking exists ─────────────────────────────────────────────
    const booking = await getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // ── Prevent double-submission ─────────────────────────────────────────
    const existing = await getReviewByBookingId(bookingId);
    if (existing) {
      return NextResponse.json(
        {
          error: "You've already submitted a review for this rental. Thanks!",
          existing_review: {
            review_id: existing.review_id,
            rating: existing.rating,
            status: existing.status,
          },
        },
        { status: 409 }
      );
    }

    // ── Determine initial status per moderation policy ────────────────────
    // 5-star → auto-publish. Anything else → pending owner review.
    const status = ratingNum === 5 ? 'approved' : 'pending';

    // ── Generate a unique review_id ───────────────────────────────────────
    const reviewId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // ── Write the review ──────────────────────────────────────────────────
    await addReview({
      review_id: reviewId,
      booking_id: bookingId,
      customer_name: booking.renter_name,
      rating: ratingNum,
      review_text: trimmedText,
      display_name: displayName.trim().slice(0, 80),
      allow_publish: allowPublish !== false, // default true
      private_note: (privateNote || '').trim().slice(0, 2000),
      status,
      location: booking.location,
      package: booking.package,
    });

    // ── Notify the owner ──────────────────────────────────────────────────
    // 5-star auto-published → friendly heads-up SMS
    // 1-4 star pending → moderation-required SMS (different tone, more urgent)
    notifyOwnerOfNewReview({
      rating: ratingNum,
      status,
      displayName: displayName.trim(),
      reviewText: trimmedText,
      location: booking.location,
      privateNote: privateNote?.trim(),
    }).catch((err) => console.error('[submit-review] notify failed (non-fatal):', err));

    // ── Send back enough info for the thank-you screen ────────────────────
    return NextResponse.json({
      ok: true,
      review_id: reviewId,
      rating: ratingNum,
      status,
      auto_published: status === 'approved',
      message:
        status === 'approved'
          ? 'Your review is live! Thanks for sharing.'
          : "Got it! We'll review and publish it shortly.",
    });
  } catch (err) {
    console.error('[submit-review][POST] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Fire-and-forget owner notification. SMS goes to every number in OWNER_PHONE_NUMBER.
async function notifyOwnerOfNewReview({
  rating,
  status,
  displayName,
  reviewText,
  location,
  privateNote,
}) {
  const ownerPhones = (process.env.OWNER_PHONE_NUMBER || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (ownerPhones.length === 0) return;

  const stars = '⭐'.repeat(rating);
  const flagLine =
    status === 'approved'
      ? `✨ New ${rating}-star review (auto-published)`
      : `⚠️ ${rating}-star review — needs your moderation`;

  const lines = [
    flagLine,
    stars,
    `${displayName} · ${location}`,
    '',
    reviewText.length > 200 ? reviewText.slice(0, 197) + '...' : reviewText,
  ];

  if (privateNote && privateNote.length > 0) {
    lines.push('');
    lines.push('🔒 Private note:');
    lines.push(privateNote.length > 150 ? privateNote.slice(0, 147) + '...' : privateNote);
  }

  if (status !== 'approved') {
    lines.push('');
    lines.push('Review at fullthrottleutah.com/admin/reviews');
  }

  const msg = lines.join('\n');

  for (const phone of ownerPhones) {
    try {
      await sendSMS(phone, msg);
    } catch (err) {
      console.error('[submit-review] owner SMS failed for', phone, ':', err);
    }
  }
}
