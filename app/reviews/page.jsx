// app/reviews/page.jsx
// Version: 2026-06-02 v2 — Refactored to fetch from API endpoint
// Last edited: June 2 2026
//
// Change from prior version: removed direct import of lib/sheets (which transitively
// pulls in googleapis and its Node-only modules). Now fetches reviews from the
// /api/public-reviews HTTP endpoint instead. Same caching strategy as before.

export const revalidate = 300;

export const metadata = {
  title: 'Customer Reviews | Full Throttle Utah',
  description:
    'Real reviews from real renters. See what customers say about jet ski rentals from Full Throttle Utah in Farmington, UT.',
  openGraph: {
    title: 'Customer Reviews | Full Throttle Utah',
    description: 'See what customers say about our jet ski rentals across Utah.',
    type: 'website',
  },
};

const NAVY = '#0C4A6E';
const ORANGE = '#EA580C';
const GOLD = '#F59E0B';
const BG = '#0B1120';
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
    console.error('[ReviewsPage] Failed to fetch reviews:', err.message);
    return null;
  }
}

export default async function ReviewsPage() {
  const data = await fetchPublicReviews();

  // Graceful fallback if fetch fails (e.g. during build)
  const reviews = data?.reviews || [];
  const count = data?.count || 0;
  const aggregateRating = data?.aggregateRating || '0.0';
  const avg = parseFloat(aggregateRating);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': 'https://www.fullthrottleutah.com',
    name: 'Full Throttle Utah',
    url: 'https://www.fullthrottleutah.com',
    image: 'https://www.fullthrottleutah.com/images/logo.png',
    telephone: '+18015481273',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Farmington',
      addressRegion: 'UT',
      addressCountry: 'US',
    },
    ...(count > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: aggregateRating,
        bestRating: '5',
        worstRating: '1',
        ratingCount: count,
        reviewCount: count,
      },
      review: reviews.slice(0, 50).map((r) => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.display_name },
        datePublished: toISODate(r.timestamp_submitted),
        reviewBody: r.review_text,
        reviewRating: {
          '@type': 'Rating',
          ratingValue: String(r.rating),
          bestRating: '5',
          worstRating: '1',
        },
      })),
    }),
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BG,
        color: TEXT,
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div
        style={{
          background: BG,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <a
            href="/"
            style={{
              color: '#fff',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '-0.5px',
              textDecoration: 'none',
            }}
          >
            ← FULL THROTTLE UTAH
          </a>
          <a
            href="/"
            style={{
              background: ORANGE,
              color: '#fff',
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Book Now
          </a>
        </div>
      </div>

      <div style={{ padding: '60px 24px 40px', textAlign: 'center' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h1
            style={{
              color: '#fff',
              fontSize: 'clamp(32px, 6vw, 48px)',
              fontWeight: 700,
              margin: '0 0 12px',
              letterSpacing: '-1px',
            }}
          >
            What Our Riders Say
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 16, lineHeight: 1.6, margin: '0 0 32px' }}>
            Real reviews from real riders across Utah's lakes.
          </p>

          {count > 0 && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 16,
                padding: '20px 28px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div style={{ fontSize: 48, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                {aggregateRating}
              </div>
              <div style={{ textAlign: 'left' }}>
                <Stars rating={Math.round(avg)} size={20} />
                <div style={{ color: '#94A3B8', fontSize: 13, marginTop: 4 }}>
                  Based on {count} review{count === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 24px 80px', background: '#F8FAFC', minHeight: '50vh' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingTop: 40 }}>
          {count === 0 && (
            <div style={{ textAlign: 'center', padding: 80, color: MUTED }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>⭐</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
                Be our first reviewer
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: MUTED,
                  maxWidth: 400,
                  margin: '0 auto',
                  lineHeight: 1.6,
                }}
              >
                Just finished a rental? We'd love to hear about your experience.
              </div>
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 20,
            }}
          >
            {reviews.map((r) => (
              <ReviewCard key={r.review_id} review={r} />
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: BG, padding: '60px 24px 80px', textAlign: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>
          Ready for your own adventure?
        </h2>
        <p style={{ color: '#94A3B8', fontSize: 15, marginBottom: 24 }}>
          Book a jet ski rental at any of 13 Utah lakes.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            background: ORANGE,
            color: '#fff',
            padding: '14px 32px',
            borderRadius: 10,
            fontSize: 16,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Book Your Ride →
        </a>
      </div>
    </div>
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
        minHeight: 200,
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
        }}
      >
        "{review.review_text}"
      </p>
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{review.display_name}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
          {[review.package, review.location].filter(Boolean).join(' · ')}
          {review.timestamp_submitted && ` · ${formatDate(review.timestamp_submitted)}`}
        </div>
      </div>
    </div>
  );
}

function Stars({ rating, size = 16 }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
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

function toISODate(iso) {
  if (!iso) return new Date().toISOString().slice(0, 10);
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}
