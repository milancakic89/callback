import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroVisual } from "./hero-visual";
import { REVIEW_SHOTS } from "./review-shots";
import { SAMPLE_ROLE } from "./sample-documents";

describe("the hero's product shot", () => {
  const html = renderToStaticMarkup(createElement(HeroVisual));

  it("is hidden from assistive technology and can't be focused", () => {
    expect(html).toMatch(/^<div aria-hidden="true" inert=""/);
  });

  it("shows the real review screen, the first of the screenshots", () => {
    expect(html).toContain(encodeURIComponent(REVIEW_SHOTS[0].desktop.src));
    expect(html).toContain(encodeURIComponent(REVIEW_SHOTS[0].mobile.src));
  });

  it("describes none of its images, as the Fast Manual Mode section already does", () => {
    const tags = html.match(/<img[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain('alt=""');
  });

  it("keeps the update the candidate receives", () => {
    expect(html).toContain("Application update");
    expect(html).toContain("invited to interview");
    expect(html).toContain(SAMPLE_ROLE.title);
  });
});
