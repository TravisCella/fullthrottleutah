// next.config.js
// Version: 2026-06-02 — Added serverComponentsExternalPackages for googleapis
// Last edited: June 2 2026
//
// Change: Added experimental.serverComponentsExternalPackages to prevent Next.js
// from trying to bundle googleapis/google-auth-library for the client. These are
// Node-only libraries (use fs, child_process, etc.) and must stay server-side.
// Fixes "Module not found: Can't resolve 'child_process'" error introduced when
// TestimonialsSection (a server component) started importing lib/sheets.js.
//
// Preserved: reactStrictMode (no change).

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },
};

module.exports = nextConfig;
