// app/api/admin/list-reviews/route.js
// Version: 2026-06-02 — Admin reviews listing
// Created: June 2 2026
// Returns all reviews sorted newest first, with optional status filter.

import { NextResponse } from 'next/server';
import { getReviews } from '../../../../lib/sheets';

export async function POST(request) {
  try {
    const { password, statusFilter } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const filter = {};
    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      filter.status = statusFilter;
    }

    const reviews = await getReviews(filter);

    // Summary counts (handy for the UI badge counts)
    const allReviews = statusFilter ? await getReviews() : reviews;
    const counts = {
      total: allReviews.length,
      pending: allReviews.filter(r => r.status === 'pending').length,
      approved: allReviews.filter(r => r.status === 'approved').length,
      rejected: allReviews.filter(r => r.status === 'rejected').length,
    };

    return NextResponse.json({ ok: true, reviews, counts });
  } catch (err) {
    console.error('[list-reviews] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
