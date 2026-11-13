import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The real header reads the session; this only checks where it sits.
vi.mock("@/components/public-header", () => ({
  PublicHeader: () => createElement("header", { "data-stub": "public-header" }),
}));

import { LegalPageShell } from "./legal-page-shell";

describe("LegalPageShell", () => {
  const html = renderToStaticMarkup(createElement(LegalPageShell, null, createElement("p", null, "The text.")));

  it("puts the public header on top, the text in the main part and the legal footer at the bottom", () => {
    const header = html.indexOf('data-stub="public-header"');
    const main = html.indexOf("<main");
    const footer = html.indexOf('aria-label="Legal"');

    expect(header).toBeGreaterThanOrEqual(0);
    expect(header).toBeLessThan(main);
    expect(main).toBeLessThan(footer);
  });

  it("holds the text inside the main part", () => {
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));

    expect(main).toContain("<p>The text.</p>");
  });
});
