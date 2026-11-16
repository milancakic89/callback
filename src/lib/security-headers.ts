// The security headers `next.config.ts` sends on every route (project-overview/security.md). They live
// here, and not inline in the config, so the rules that depend on the environment can be tested: the
// config passes `NODE_ENV` and `APP_URL` in.

export interface SecurityHeaderEnvironment {
  // `process.env.NODE_ENV`: "development" under `next dev`, "production" for `next build`.
  nodeEnv: string | undefined;
  // `process.env.APP_URL`: the public origin the app is served from.
  appUrl: string | undefined;
}

export interface SecurityHeader {
  key: string;
  value: string;
}

const HTTPS_ORIGIN = /^https:\/\//i;

// `upgrade-insecure-requests` and `Strict-Transport-Security` only make sense for a site served over
// https. Served over plain http (Docker Compose on `http://localhost`, `next start`, a LAN address),
// `upgrade-insecure-requests` makes Safari, and every browser on an address other than localhost,
// rewrite the page's own `/_next/...` requests to https, which nothing answers (Chromium leaves
// `localhost` alone), and a browser ignores HSTS received over http, so it would only be noise.
// callback.rs is https (`APP_URL=https://callback.rs`), so it keeps both.
export function isServedOverHttps({ nodeEnv, appUrl }: SecurityHeaderEnvironment): boolean {
  return nodeEnv === "production" && HTTPS_ORIGIN.test(appUrl?.trim() ?? "");
}

// Static CSP: nonce-based CSP is incompatible with Partial Prerendering (cacheComponents).
export function buildContentSecurityPolicy(environment: SecurityHeaderEnvironment): string {
  const isDevelopment = environment.nodeEnv === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isServedOverHttps(environment) ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function buildSecurityHeaders(environment: SecurityHeaderEnvironment): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(environment) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    },
    { key: "X-Frame-Options", value: "DENY" },
    ...(isServedOverHttps(environment)
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
      : []),
  ];
}
