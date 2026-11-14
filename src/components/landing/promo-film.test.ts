import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromoFilm } from "./promo-film";
import { PROMO_VIDEO_FILES } from "./promo-video-files";

describe("the promo film section", () => {
  const html = renderToStaticMarkup(createElement(PromoFilm));

  it("is the #film section, with a line on top like the problem section", () => {
    expect(html).toMatch(/^<section id="film" class="[^"]*border-t border-\(--l-line\)/);
  });

  it("has the eyebrow, the heading and the one muted line", () => {
    expect(html).toContain(">In 60 seconds</p>");
    expect(html).toMatch(/<h2[^>]*>See how Callback works\.<\/h2>/);
    expect(html).toContain("For candidates and employers: from the application to the interview.");
  });

  it("is revealed on scroll like the other sections", () => {
    expect(html.match(/data-reveal/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("says what to expect under the film: the length, the sound and the captions", () => {
    expect(html).toContain("1:00 · Sound on · Captions available");
  });

  it("holds the film itself, from the files in promo-video-files.ts", () => {
    expect(html).toContain(`poster="${PROMO_VIDEO_FILES.poster}"`);
    expect(html).toContain(`src="${PROMO_VIDEO_FILES.video}"`);
    expect(html).toContain(`src="${PROMO_VIDEO_FILES.captions}"`);
  });

  it("is plain HTML a visitor without scripting can play: native controls, no play button", () => {
    expect(html).toMatch(/<video[^>]*\scontrols=""/);
    expect(html).not.toContain("Play the 60-second film");
  });
});
