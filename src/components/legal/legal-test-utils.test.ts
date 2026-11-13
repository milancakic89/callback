import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderSection, TEST_OPERATOR } from "./legal-test-utils";

describe("renderSection", () => {
  it("renders the body of a section as markup", () => {
    const html = renderSection({ id: "part", title: "Part", body: createElement("p", null, "Some text.") });

    expect(html).toBe("<p>Some text.</p>");
  });
});

describe("TEST_OPERATOR", () => {
  it("is not the real operator, so a text can't pass by printing the real details", () => {
    expect(TEST_OPERATOR.operatorName).not.toBe("Milan Cakic");
    expect(TEST_OPERATOR.contactEmail).toMatch(/@example\.test$/);
  });
});
