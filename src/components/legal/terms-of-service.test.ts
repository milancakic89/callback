import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { APOSTROPHE, TEST_OPERATOR } from "./legal-test-utils";
import { TermsOfService } from "./terms-of-service";

const html = renderToStaticMarkup(
  createElement(TermsOfService, { operator: TEST_OPERATOR, lastUpdated: "2 February 2027" }),
);

const headings = [...html.matchAll(/<h2[^>]*>(\d+)\. ([^<]+)<\/h2>/g)].map((match) => ({ number: match[1], title: match[2] }));

describe("TermsOfService", () => {
  it("has its title, the date it is given and a link to the Privacy Policy", () => {
    expect(html).toContain(">Terms of Service</h1>");
    expect(html).toContain("Last updated: 2 February 2027");
    expect(html).toContain('href="/privacy"');
  });

  it("has fourteen numbered parts, in order", () => {
    expect(headings.map((heading) => heading.title)).toEqual([
      "About these terms",
      "What Callback is",
      "Your account",
      "If you are a candidate",
      "If you are an employer",
      "Acceptable use",
      "Your content",
      "Job listings and other services",
      "The service as it is",
      "Ending your account",
      "Liability",
      "Governing law",
      "Changes to these terms",
      "Contact",
    ]);
  });

  it("refers to the part about other people's listings by its number", () => {
    const listings = headings.find((heading) => heading.title === "Job listings and other services");

    expect(listings?.number).toBe("8");
    expect(html).toContain("publishers (part 8)");
  });

  it("names who the agreement is with, from the operator it is given", () => {
    expect(html).toContain("between you and Ana Test, a private person in Freedonia");
    expect(html).toContain("https://example.test");
    expect(html).toContain('href="mailto:privacy@example.test"');
    expect(html).not.toContain("Milan Cakic");
  });

  it("makes an employer responsible for the applications it receives", () => {
    expect(html).toContain("you are responsible for handling them lawfully");
    expect(html).toContain(`Don${APOSTROPHE}t sell it or pass it on`);
    expect(html).toContain("only to people who applied to you");
  });

  it("tells a candidate they may withdraw, and that no answer or hire is promised", () => {
    expect(html).toContain("You can withdraw it at any time");
    expect(html).toContain("doesn" + APOSTROPHE + "t promise that an employer will answer, interview or hire you");
  });

  it("says the content stays the user's, and what we may do with it", () => {
    expect(html).toContain("You keep ownership of what you upload or write");
    expect(html).toContain("only as far as we need to");
  });

  it("says the service is free today and that a charge would be announced first", () => {
    expect(html).toContain("free to use today");
    expect(html).toContain("we will say so before you are asked to pay");
  });

  it("limits liability, but not where the law doesn't allow it, and leaves consumers' rights", () => {
    expect(html).toContain("To the extent the law allows");
    expect(html).toContain("intent or gross negligence");
    expect(html).toContain("rights a consumer has under mandatory law");
  });

  it("is governed by Serbian law", () => {
    expect(html).toContain("law of the Republic of Serbia");
  });

  it("has a contents list whose every link goes to a section of the page", () => {
    const linked = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    const present = [...html.matchAll(/<section[^>]* id="([^"]+)"/g)].map((match) => match[1]);

    expect(linked).toHaveLength(14);
    expect(present).toEqual(linked);
  });
});
