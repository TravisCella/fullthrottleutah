// app/api/admin/moderate-review/route.js
// Version: 2026-06-02 — Admin review moderation
// Created: June 2 2026
//
// Supports three actions:
//   approve  — flip status to 'approved' (visible publicly)
//   reject   — flip status to 'rejected' (kept in sheet but never displayed)
//   rename   — update the display_name (admin can clean up if the customer
//              entered something weird, profane, or just first-name-only when
//              you'd prefer first + last initial)

import { NextResponse } from 'next/server';
import {
  updateReviewStatus,
  updateReviewDisplayName,
} from '../../../../lib/sheets';

export async function POST(request) {
  try {
    const { password, reviewId, action, moderatorNotes, newDisplayName } =
      await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!reviewId) {
      return NextResponse.json({ error: 'Missing reviewId' }, { status: 400 });
    }
    if (!action) {
      return NextResponse.json({ error: 'Missing action' }, { status: 400 });
    }

    if (action === 'approve') {
      await updateReviewStatus(reviewId, 'approved', moderatorNotes || '');
      return NextResponse.json({ ok: true, reviewId, newStatus: 'approved' });
    }

    if (action === 'reject') {
      await updateReviewStatus(reviewId, 'rejected', moderatorNotes || '');
      return NextResponse.json({ ok: true, reviewId, newStatus: 'rejected' });
    }

    if (action === 'rename') {
      if (!newDisplayName || !newDisplayName.trim()) {
        return NextResponse.json({ error: 'Missing newDisplayName' }, { status: 400 });
      }
      await updateReviewDisplayName(reviewId, newDisplayName.trim().slice(0, 80));
      return NextResponse.json({ ok: true, reviewId, newDisplayName: newDisplayName.trim() });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}. Use approve, reject, or rename.` },
      { status: 400 }
    );
  } catch (err) {
    console.error('[moderate-review] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
