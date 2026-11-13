import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LEGAL_LINKS } from "@/lib/legal/constants";
import { LegalConsent } from "./legal-consent";

describe("LegalConsent", () => {
  const html = renderToStaticMarkup(createElement(LegalConsent));

  it("says that creating an account means agreeing to both documents", () => {
    expect(html).toContain("By creating an account you agree to the");
    expect(html).toContain(`>${LEGAL_LINKS.terms.label}</a>`);
    expect(html).toContain(`>${LEGAL_LINKS.privacy.label}</a>`);
  });

  it("links each document", () => {
    expect(html).toContain(`href="${LEGAL_LINKS.terms.href}"`);
    expect(html).toContain(`href="${LEGAL_LINKS.privacy.href}"`);
  });

  it("opens them in a new tab, so the half-filled form is kept", () => {
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/rel="noopener"/g)).toHaveLength(2);
  });
});
