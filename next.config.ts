import type { NextConfig } from "next";
// A relative import: the config is loaded by Next itself, which doesn't know tsconfig's `@/` alias.
import { buildSecurityHeaders } from "./src/lib/security-headers";

// The headers are computed when the config is loaded, so a build bakes them in: `next build` must see
// the APP_URL the site will be served from. https (callback.rs) adds upgrade-insecure-requests and
// HSTS; http://localhost (Docker Compose) doesn't (src/lib/security-headers.ts).
const securityHeaders = buildSecurityHeaders({
  nodeEnv: process.env.NODE_ENV,
  appUrl: process.env.APP_URL,
});

const nextConfig: NextConfig = {
  // A self-contained server in .next/standalone (no node_modules install on the host), started with
  // `node server.js`. It is what the GitHub Actions deploy ships; see project-overview/deployment.md.
  output: "standalone",
  poweredByHeader: false,
  // Caddy compresses the responses (deploy/Caddyfile: `encode zstd gzip`), on all of the server's
  // cores. Next's own gzip ran on the one thread that renders, and would compress what Caddy then
  // compresses again. `next start` without Caddy in front sends everything uncompressed.
  compress: false,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // A Server Action gets at most one PDF of up to 5 MB (features/candidate-cvs.md): a CV uploaded to
    // the account, or an application's cover letter (the CV is already on the account). The body
    // defaults to 1 MB; 6 MB is one file and the form's fields. Proxy's copy of a request body
    // (`proxyClientMaxBodySize`, past which it is cut short, silently) defaults to 10 MB, which is
    // enough.
    serverActions: { bodySizeLimit: "6mb" },
  },
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
    ];
  },
};

export default nextConfig;
