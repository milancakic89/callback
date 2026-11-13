import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContactLink, ExternalLink } from "./legal-links";

describe("ContactLink", () => {
  it("is a mailto link that shows the address", () => {
    const html = renderToStaticMarkup(createElement(ContactLink, { email: "privacy@example.test" }));

    expect(html).toContain('href="mailto:privacy@example.test"');
    expect(html).toContain(">privacy@example.test</a>");
  });
});

describe("ExternalLink", () => {
  it("opens in a new tab that can't reach back, and carries its text", () => {
    const html = renderToStaticMarkup(createElement(ExternalLink, { href: "https://example.test/policy" }, "The policy"));

    expect(html).toContain('href="https://example.test/policy"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(">The policy</a>");
  });
});
