import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asRenderedHtml } from "./html-test-utils";
import { ProductShot } from "./product-shot";
import { REVIEW_SHOTS } from "./review-shots";

const SHOT = REVIEW_SHOTS[0];

function render(props: { decorative?: boolean; className?: string } = {}) {
  return renderToStaticMarkup(createElement(ProductShot, { shot: SHOT, ...props }));
}

function imageTags(html: string): string[] {
  return html.match(/<img[^>]*>/g) ?? [];
}

describe("a Fast Manual Mode screenshot", () => {
  it("renders the laptop's screenshot and the phone's, each with its description", () => {
    const tags = imageTags(render());
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain(`alt="${asRenderedHtml(SHOT.desktop.alt)}"`);
    expect(tags[1]).toContain(`alt="${asRenderedHtml(SHOT.mobile.alt)}"`);
  });

  it("gives each image its size, so nothing shifts while it loads", () => {
    const [laptop, phone] = imageTags(render());
    expect(laptop).toContain(`width="${SHOT.desktop.width}"`);
    expect(laptop).toContain(`height="${SHOT.desktop.height}"`);
    expect(phone).toContain(`width="${SHOT.mobile.width}"`);
    expect(phone).toContain(`height="${SHOT.mobile.height}"`);
  });

  it("shows the laptop's from lg up and the phone's below it", () => {
    const [laptop, phone] = imageTags(render());
    expect(laptop).toContain("hidden");
    expect(laptop).toContain("lg:block");
    expect(phone).toContain("lg:hidden");
  });

  it("serves the files from /landing/ through the image optimiser", () => {
    const html = render();
    expect(html).toContain("/_next/image?url=%2Flanding%2Freview-desktop.webp");
    expect(html).toContain("/_next/image?url=%2Flanding%2Freview-mobile.webp");
  });

  it("leaves the description empty on a decorative copy", () => {
    const tags = imageTags(render({ decorative: true }));
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toContain('alt=""');
  });

  it("passes the class name to the wrapper", () => {
    expect(render({ className: "mt-4" })).toMatch(/^<div class="mt-4">/);
  });
});
