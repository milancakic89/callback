import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TEST_OPERATOR } from "./legal-test-utils";
import { PrivacyPolicy } from "./privacy-policy";

const html = renderToStaticMarkup(
  createElement(PrivacyPolicy, { operator: TEST_OPERATOR, lastUpdated: "2 February 2027" }),
);

// ["1", "Who we are"], ["2", "What we collect"], ...
const headings = [...html.matchAll(/<h2[^>]*>(\d+)\. ([^<]+)<\/h2>/g)].map((match) => ({ number: match[1], title: match[2] }));

describe("PrivacyPolicy", () => {
  it("has its title, the date it is given and an intro that names the service and its address", () => {
    expect(html).toContain(">Privacy Policy</h1>");
    expect(html).toContain("Last updated: 2 February 2027");
    expect(html).toContain("Callback (https://example.test) helps people find jobs");
  });

  it("has twelve numbered parts, in order", () => {
    expect(headings.map((heading) => heading.title)).toEqual([
      "Who we are",
      "What we collect",
      "How we use it, and on what ground",
      "Who sees your data",
      "Google user data",
      "Where data is processed",
      "How long we keep it",
      "Your rights",
      "Cookies",
      "Security",
      "Children",
      "Changes to this policy",
    ]);
    expect(headings.map((heading) => heading.number)).toEqual(Array.from({ length: 12 }, (_, index) => String(index + 1)));
  });

  // The parts refer to each other by number; reordering them without changing the references would
  // send a reader to the wrong part.
  it("points each reference to a part by the number of the part it means", () => {
    const titleOf = (number: string) => headings.find((heading) => heading.number === number)?.title;

    expect(titleOf("4")).toBe("Who sees your data");
    expect(titleOf("5")).toBe("Google user data");
    expect(titleOf("8")).toBe("Your rights");
    expect(titleOf("9")).toBe("Cookies");
    for (const reference of ["part 4", "part 5", "part 8", "part 9"]) expect(html, reference).toContain(reference);
  });

  it("has a contents list whose every link goes to a section of the page", () => {
    const linked = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    const present = [...html.matchAll(/<section[^>]* id="([^"]+)"/g)].map((match) => match[1]);

    expect(linked).toHaveLength(12);
    expect(present).toEqual(linked);
    expect(new Set(present).size).toBe(present.length);
  });

  it("prints the operator it is given, not a built-in one", () => {
    expect(html).toContain("Ana Test");
    expect(html).toContain("Freedonia");
    expect(html).toContain("privacy@example.test");
    expect(html).not.toContain("Milan Cakic");
    expect(html).not.toContain("callback.online");
  });
});
