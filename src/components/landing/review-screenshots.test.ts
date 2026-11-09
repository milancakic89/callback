import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asRenderedHtml } from "./html-test-utils";
import { ReviewScreenshots } from "./review-screenshots";
import { REVIEW_SHOTS } from "./review-shots";

function render() {
  return renderToStaticMarkup(createElement(ReviewScreenshots, { shots: REVIEW_SHOTS }));
}

describe("the Fast Manual Mode screenshots, switchable", () => {
  const html = render();

  it("has one tab per screenshot, named after it", () => {
    expect(html.match(/role="tab"/g)).toHaveLength(REVIEW_SHOTS.length);
    for (const shot of REVIEW_SHOTS) expect(html).toContain(`>${shot.label}</button>`);
  });

  it("starts on the first screenshot, and only that tab is in the tab order", () => {
    const tabs = html.match(/<button[^>]*role="tab"[^>]*>/g) ?? [];
    expect(tabs[0]).toContain('aria-selected="true"');
    expect(tabs[0]).toContain('tabindex="0"');
    for (const tab of tabs.slice(1)) {
      expect(tab).toContain('aria-selected="false"');
      expect(tab).toContain('tabindex="-1"');
    }
  });

  it("joins each tab to its panel", () => {
    for (const shot of REVIEW_SHOTS) {
      expect(html).toContain(`id="review-tab-${shot.id}"`);
      expect(html).toContain(`aria-controls="review-panel-${shot.id}"`);
      expect(html).toContain(`id="review-panel-${shot.id}"`);
      expect(html).toContain(`aria-labelledby="review-tab-${shot.id}"`);
    }
  });

  it("makes every panel but the first inert, so it can't be reached while it is invisible", () => {
    const panels = html.match(/<div[^>]*role="tabpanel"[^>]*>/g) ?? [];
    expect(panels).toHaveLength(REVIEW_SHOTS.length);
    expect(panels[0]).not.toContain("inert");
    for (const panel of panels.slice(1)) expect(panel).toContain("inert");
  });

  it("says what the first screenshot shows", () => {
    expect(html).toContain(asRenderedHtml(REVIEW_SHOTS[0].caption));
  });

  it("puts every screenshot in the page, so each is loaded before its tab is picked", () => {
    for (const shot of REVIEW_SHOTS) {
      expect(html).toContain(encodeURIComponent(shot.desktop.src));
    }
  });
});
