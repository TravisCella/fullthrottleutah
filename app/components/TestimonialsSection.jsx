// app/components/TestimonialsSection.jsx
// Version: 2026-06-02 — Landing page testimonials section
// Created: June 2 2026
//
// Drop-in server component for the homepage. Renders 4 most recent 5-star reviews
// in a horizontally scrollable row (or grid on desktop), with LocalBusiness +
// AggregateRating JSON-LD so Google can show the star rating in search results
// for searches that land on the homepage.
//
// USAGE in your landing page (app/page.js):
//
//   import TestimonialsSection from './components/TestimonialsSection';
//
//   export default function Home() {
//     return (
//       <>
//         {/* ... your existing landing page content ... */}
//         <TestimonialsSection />
//         {/* ... rest of landing page ... */}
//       </>
//     );
//   }
//
// Caching: revalidate handled by Next.js — the parent page sets revalidate, OR you
// can fetch reviews via getReviews directly in the parent page and pass them in
// as a prop. This component just fetches on its own for simplicity.

import { getReviews } from '../../lib/sheets';

const NAVY = '#0C4A6E';
const ORANGE = '#EA580C';
const GOLD = '#F59E0B';
const CARD = '#FFFFFF';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';

export default async function TestimonialsSection() {
  // Pull ALL approved + publishable reviews for accurate aggregate stats
  const allReviews = await getReviews({
    status: 'approved',
    allowPublishOnly: true,
  });

  if (allReviews.length === 0) {
    // No reviews yet — render nothing (don't show an empty "We have no reviews" section)
    return null;
  }

  const count = allReviews.length;
  const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
  const avg = totalRating / count;
  const aggregateRating = avg.toFixed(1);

  // Featured = most recent 5-star reviews, max 4
  const featured = allReviews
    .filter(r => r.rating === 5)
    .slice(0, 4);

  // Fallback: if fewer than 2 five-star reviews exist, show the most recent regardless
  const display = featured.length >= 2 ? featured : allReviews.slice(0, 4);

  // JSON-LD for the homepage — LocalBusiness with AggregateRating.
  // This is what gets you the gold stars under your business name in Google search.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': 'https://www.fullthrottleutah.com',
    name: 'Full Throttle Utah',
    url: 'https://www.fullthrottleutah.com',
    image: 'https://www.fullthrottleutah.com/images/logo.png',
    telephone: '+18015481273',
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Farmington',
      addressRegion: 'UT',
      addressCountry: 'US',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: aggregateRating,
      bestRating: '5',
      worstRating: '1',
      ratingCount: count,
      reviewCount: count,
    },
  };

  return (
    <section
      style={{
        background: '#F8FAFC',
        padding: '80px 24px',
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              background: '#FEF3C7',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              color: '#92400E',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 16,
            }}
          >
            ⭐ {aggregateRating} from {count} review{count === 1 ? '' : 's'}
          </div>
          <h2
            style={{
              fontSize: 'clamp(28px, 5vw, 40px)',
              fontWeight: 700,
              color: TEXT,
              margin: '0 0 12px',
              letterSpacing: '-0.5px',
            }}
          >
            What our riders say
          </h2>
          <p style={{ fontSize: 16, color: MUTED, margin: 0, lineHeight: 1.6 }}>
            Real reviews from real riders across Utah's lakes.
          </p>
        </div>

        {/* Review grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            marginBottom: 40,
          }}
        >
          {display.map(r => (
            <ReviewCard key={r.review_id} review={r} />
          ))}
        </div>

        {/* See all reviews CTA */}
        <div style={{ textAlign: 'center' }}>
          <a
            href="/reviews"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              borderRadius: 10,
              border: `2px solid ${NAVY}`,
              background: 'transparent',
              color: NAVY,
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            See all {count} reviews →
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function ReviewCard({ review }) {
  return (
    <div
      style={{
        background: CARD,
        borderRadius: 14,
        padding: 24,
        border: `1px solid ${BORDER}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Stars rating={review.rating} size={16} />

      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: TEXT,
          margin: '12px 0 16px',
          flex: 1,
          // Cap displayed length to keep cards visually balanced
          display: '-webkit-box',
          WebkitLineClamp: 5,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        "{review.review_text}"
      </p>

      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{review.display_name}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
          {[review.package, review.location].filter(Boolean).join(' · ')}
        </div>
      </div>
    </div>
  );
}

function Stars({ rating, size = 16 }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          style={{
            fontSize: size,
            color: n <= rating ? GOLD : '#E2E8F0',
            lineHeight: 1,
          }}
        >
          ★
        </span>
      ))}
    </div>
  );
}
