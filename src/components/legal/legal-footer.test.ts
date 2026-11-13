import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LEGAL_LINKS } from "@/lib/legal/constants";
import { LegalFooter } from "./legal-footer";

describe("LegalFooter", () => {
  const html = renderToStaticMarkup(createElement(LegalFooter));

  it("links both documents, with the labels the rest of the app uses", () => {
    for (const link of Object.values(LEGAL_LINKS)) {
      expect(html).toContain(`href="${link.href}"`);
      expect(html).toContain(`>${link.label}</a>`);
    }
  });

  it("links the front page", () => {
    expect(html).toContain('href="/"');
    expect(html).toContain(">Home</a>");
  });

  it("is a labelled navigation inside a footer", () => {
    expect(html).toMatch(/^<footer/);
    expect(html).toContain('aria-label="Legal"');
  });
});
