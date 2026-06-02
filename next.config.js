// next.config.js
// Version: 2026-06-02 — Added webpack fallback for Node modules (full fix)
// Last edited: June 2 2026
//
// Change from prior version: Added webpack config that tells the CLIENT bundle to
// silently skip Node-only modules (fs, net, tls, child_process, dns). The
// serverComponentsExternalPackages option alone was insufficient because webpack
// was still trying to include these in the client bundle when it encountered them
// during static analysis of the import graph. Setting fallback: false for each
// makes webpack ignore them on the client.
//
// Why this is safe: these modules are only ever called inside server components or
// API routes — code paths that never run in the browser. The client bundle never
// actually needs them; it just needs webpack to not crash when it sees them in
// the dependency graph.
//
// Preserved: reactStrictMode (no change).

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'google-auth-library'],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Tell webpack: when bundling for the BROWSER, these Node-only modules
      // don't exist. Don't try to include them. Don't fail.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        dns: false,
        http2: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
