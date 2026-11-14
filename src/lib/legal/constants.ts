// What the public legal pages say about who runs Callback (features/legal-pages.md). The documents take
// these as props instead of importing them, so they can be tested with other values; only the two pages
// under src/app read this file. No `server-only`: nothing here is secret, the values are printed on
// public pages.

export type LegalOperator = {
  // The service as the texts call it, and where it lives (an origin, no trailing slash).
  serviceName: string;
  siteUrl: string;
  // Who runs it: the controller of the personal data, in the words of data protection law.
  operatorName: string;
  operatorStatus: string;
  country: string;
  // Where every privacy request and every question about the Terms goes.
  contactEmail: string;
};

export const LEGAL_OPERATOR: LegalOperator = {
  serviceName: "Callback",
  siteUrl: "https://callback.rs",
  operatorName: "Milan Cakic",
  operatorStatus: "a private person",
  country: "Serbia",
  contactEmail: "callback.online@gmail.com",
};

// Written by hand, not read from the clock: reading it here would bake the build date into the static
// pages (and Next stops a prerender that reads `Date.now()`). Change it whenever a text changes.
export const LEGAL_LAST_UPDATED = "14 November 2026";

// The two documents, for every place that links to them (the landing footer, the legal pages' footer,
// the sign-up form).
export const LEGAL_LINKS = {
  privacy: { href: "/privacy", label: "Privacy Policy" },
  terms: { href: "/terms", label: "Terms of Service" },
} as const;
