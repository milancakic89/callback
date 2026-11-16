import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  isServedOverHttps,
  type SecurityHeaderEnvironment,
} from "./security-headers";

const production: SecurityHeaderEnvironment = { nodeEnv: "production", appUrl: "https://callback.rs" };
const productionOnLocalhost: SecurityHeaderEnvironment = {
  nodeEnv: "production",
  appUrl: "http://localhost:3000",
};
const development: SecurityHeaderEnvironment = { nodeEnv: "development", appUrl: "http://localhost:3000" };

function headerValue(environment: SecurityHeaderEnvironment, key: string): string | undefined {
  return buildSecurityHeaders(environment).find((header) => header.key === key)?.value;
}

describe("isServedOverHttps", () => {
  it("is true for a production build whose APP_URL is https", () => {
    expect(isServedOverHttps(production)).toBe(true);
  });

  it("is false for a production build served over http, as on localhost in Docker Compose", () => {
    expect(isServedOverHttps(productionOnLocalhost)).toBe(false);
    expect(isServedOverHttps({ nodeEnv: "production", appUrl: "http://192.168.1.20:3000" })).toBe(false);
  });

  it("is false under next dev, whatever the APP_URL is", () => {
    expect(isServedOverHttps({ nodeEnv: "development", appUrl: "https://callback.rs" })).toBe(false);
  });

  it("is false when APP_URL is missing or empty", () => {
    expect(isServedOverHttps({ nodeEnv: "production", appUrl: undefined })).toBe(false);
    expect(isServedOverHttps({ nodeEnv: "production", appUrl: "" })).toBe(false);
  });

  it("is false when NODE_ENV is not production", () => {
    expect(isServedOverHttps({ nodeEnv: undefined, appUrl: "https://callback.rs" })).toBe(false);
    expect(isServedOverHttps({ nodeEnv: "test", appUrl: "https://callback.rs" })).toBe(false);
  });

  it("reads the scheme without caring about case or surrounding spaces", () => {
    expect(isServedOverHttps({ nodeEnv: "production", appUrl: "HTTPS://callback.rs" })).toBe(true);
    expect(isServedOverHttps({ nodeEnv: "production", appUrl: "  https://callback.rs  " })).toBe(true);
  });

  it("does not take a host that merely contains https for an https origin", () => {
    expect(isServedOverHttps({ nodeEnv: "production", appUrl: "http://https.example.com" })).toBe(false);
    expect(isServedOverHttps({ nodeEnv: "production", appUrl: "ftp://x/https://" })).toBe(false);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("is the production policy of callback.rs, ending in upgrade-insecure-requests", () => {
    expect(buildContentSecurityPolicy(production)).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
      ].join("; "),
    );
  });

  it("leaves out upgrade-insecure-requests on http, so a production build works in Safari and on a LAN address", () => {
    const policy = buildContentSecurityPolicy(productionOnLocalhost);
    expect(policy).not.toContain("upgrade-insecure-requests");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows unsafe-eval only under next dev, and never upgrades there", () => {
    const policy = buildContentSecurityPolicy(development);
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});

describe("buildSecurityHeaders", () => {
  it("sends Strict-Transport-Security for an https production site", () => {
    expect(headerValue(production, "Strict-Transport-Security")).toBe("max-age=63072000");
  });

  it("does not send Strict-Transport-Security on http or in development", () => {
    expect(headerValue(productionOnLocalhost, "Strict-Transport-Security")).toBeUndefined();
    expect(headerValue(development, "Strict-Transport-Security")).toBeUndefined();
  });

  it("sends the same headers everywhere else", () => {
    for (const environment of [production, productionOnLocalhost, development]) {
      expect(headerValue(environment, "X-Content-Type-Options")).toBe("nosniff");
      expect(headerValue(environment, "X-Frame-Options")).toBe("DENY");
      expect(headerValue(environment, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(headerValue(environment, "Permissions-Policy")).toBe(
        "camera=(), microphone=(), geolocation=(), browsing-topics=()",
      );
      expect(headerValue(environment, "Content-Security-Policy")).toBeTruthy();
    }
  });

  it("is, for callback.rs, six headers in the order the config always sent them", () => {
    expect(buildSecurityHeaders(production).map((header) => header.key)).toEqual([
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "X-Frame-Options",
      "Strict-Transport-Security",
    ]);
  });
});
