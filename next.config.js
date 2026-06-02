// next.config.js
// Version: 2026-06-02 v3 — Cleaned up after refactor
// Last edited: June 2 2026
//
// Change from prior version: removed the webpack.resolve.fallback hack. It was a
// workaround for googleapis being pulled into the client bundle via TestimonialsSection.
// After refactoring TestimonialsSection and reviews/page.jsx to fetch from the
// /api/public-reviews endpoint instead of importing lib/sheets directly, googleapis
// is now ONLY imported from API routes (which are always server-only), so no bundling
// hack is needed.
//
// Kept: reactStrictMode and serverComponentsExternalPackages (the latter is harmless
// belt-and-suspenders for any future server component that uses googleapis).

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },
};

module.exports = nextConfig;
