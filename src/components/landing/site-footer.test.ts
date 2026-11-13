import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LEGAL_LINKS } from "@/lib/legal/constants";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  const html = renderToStaticMarkup(createElement(SiteFooter));

  // Google's app verification looks for the privacy policy on the home page (features/legal-pages.md).
  it("links the Privacy Policy and the Terms of Service", () => {
    for (const link of Object.values(LEGAL_LINKS)) {
      expect(html).toContain(`href="${link.href}"`);
      expect(html).toContain(`>${link.label}</a>`);
    }
    expect(html).toContain('aria-label="Legal"');
  });

  it("keeps its other links and its note about the listings and the sample candidates", () => {
    for (const href of ["/jobs", "/sign-up", "/sign-in", "#pricing"]) expect(html, href).toContain(`href="${href}"`);
    expect(html).toContain("Job listings belong to their publishers.");
    expect(html).toContain("Candidates and documents shown on this page are fictional.");
  });
});
