import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FastManual } from "./fast-manual";
import { REVIEW_SHOTS } from "./review-shots";

describe("the Fast Manual Mode section", () => {
  const html = renderToStaticMarkup(createElement(FastManual));

  it("is the target of the page's #product links", () => {
    expect(html).toContain('id="product"');
  });

  it("is tagged as available now, with its heading", () => {
    expect(html).toContain("Available now");
    expect(html).toContain("Two documents. One decision. Next.");
  });

  it("shows every screenshot of the real screen", () => {
    for (const shot of REVIEW_SHOTS) expect(html).toContain(encodeURIComponent(shot.desktop.src));
  });

  it("says the screenshots are real and the people in them are not", () => {
    expect(html).toContain("Screenshots of the real screen");
    expect(html).toContain("fictional");
  });

  it("doesn't promise what isn't built: no word about telling the candidate", () => {
    expect(html.toLowerCase()).not.toContain("notif");
    expect(html.toLowerCase()).not.toContain("candidate is told");
  });
});
