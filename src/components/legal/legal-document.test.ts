import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalDocument, type LegalSectionContent } from "./legal-document";

const SECTIONS: LegalSectionContent[] = [
  { id: "first-part", title: "The first part", body: createElement("p", null, "Body of the first part.") },
  { id: "second-part", title: "The second part", body: createElement("p", null, "Body of the second part.") },
];

const render = (sections = SECTIONS) =>
  renderToStaticMarkup(
    createElement(LegalDocument, {
      title: "Example Policy",
      lastUpdated: "1 January 2026",
      intro: createElement("p", null, "What this text is."),
      sections,
    }),
  );

describe("LegalDocument", () => {
  it("has the title as its one h1, the date it was last updated and the intro", () => {
    const html = render();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Example Policy</h1>");
    expect(html).toContain("Last updated: 1 January 2026");
    expect(html).toContain("What this text is.");
  });

  it("numbers the sections in order, each with its heading and its text", () => {
    const html = render();

    expect(html).toContain('id="first-part"');
    expect(html).toMatch(/<h2[^>]*>1\. The first part<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>2\. The second part<\/h2>/);
    expect(html.indexOf("Body of the first part.")).toBeLessThan(html.indexOf("Body of the second part."));
  });

  it("lists the contents with one link to each section", () => {
    const html = render();

    expect(html).toContain('aria-label="Contents"');
    for (const section of SECTIONS) {
      expect(html).toContain(`href="#${section.id}"`);
      expect(html).toContain(`aria-labelledby="${section.id}-heading"`);
    }
  });

  it("links the contents only to sections that are on the page", () => {
    const html = render();

    const linked = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    const present = [...html.matchAll(/<section[^>]* id="([^"]+)"/g)].map((match) => match[1]);
    expect(linked.length).toBeGreaterThan(0);
    expect(present).toEqual(expect.arrayContaining(linked));
  });

  it("renders with no sections without breaking", () => {
    const html = render([]);

    expect(html).toContain("Example Policy");
    expect(html).not.toContain("<section");
  });
});
