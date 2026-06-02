// app/components/TestimonialsSection.jsx
// Version: 2026-06-02 v2 — Refactored to fetch from API endpoint
// Last edited: June 2 2026
//
// Change from prior version: removed direct import of lib/sheets (which transitively
// pulls in googleapis and its Node-only modules). Now fetches reviews from the
// /api/public-reviews HTTP endpoint instead. Result: this component has zero
// server-only npm dependencies, so it bundles cleanly for both server and (RSC payload).
//
// Caching: the API endpoint has revalidate=300 set, and we pass revalidate=300 on the
// fetch as well, so Sheets gets hit at most once per 5 min regardless of traffic.
//
// Build-time behavior: at Vercel build time, the API endpoint isn't reachable yet
// (deployment isn't live). The try/catch fallback renders with empty data, and the
// component returns null when there are no reviews. After deployment, the first
// page request triggers revalidation in the background, and subsequent requests
// show real data.

const NAVY = '#0C4A6E';
const ORANGE = '#EA580C';
const GOLD = '#F59E0B';
const CARD = '#FFFFFF';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';

function getBaseUrl() {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

async function fetchPublicReviews() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/public-reviews`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[TestimonialsSection] Failed to fetch reviews:', err.message);
    return null;
  }
}

export default async function TestimonialsSection() {
  const data = await fetchPublicReviews();
  if (!data || !data.reviews || data.reviews.length === 0) {
    // No reviews yet, or fetch failed (e.g. at build time) — render nothing
    return null;
  }

  const { reviews: allReviews, count, aggregateRating } = data;

  // Featured = most recent 5-star reviews, max 4
  const featured = allReviews.filter(r => r.rating === 5).slice(0, 4);
  const display = featured.length >= 2 ? featured : allReviews.slice(0, 4);

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
