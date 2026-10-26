import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Static CSP: nonce-based CSP is incompatible with Partial Prerendering (cacheComponents).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]),
];

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone (no node_modules install on the host), started with
  // `node server.js`. It is what the GitHub Actions deploy ships; see project-overview/deployment.md.
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // The public job list moved from / to /jobs (features/landing.md). Links shared before the move
  // carry the explorer's state in the query string (q, f, sort); send those on, query intact.
  async redirects() {
    return [
      ...["q", "f", "sort"].map((key) => ({
        source: "/",
        has: [{ type: "query" as const, key }],
        destination: "/jobs",
        permanent: false,
      })),
      // The employer home moved from /employer to the company's slug (features/companies.md).
      // Activation emails sent before the move still carry next=/employer. "/test" is TEST_COMPANY's
      // slug (not imported: next.config.ts has no path aliases); drop this once slugs come from accounts.
      { source: "/employer", destination: "/test", permanent: false },
      { source: "/employer/:path*", destination: "/test/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
