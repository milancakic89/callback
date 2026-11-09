import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutoTrackedBadge } from "./auto-tracked-badge";

describe("AutoTrackedBadge", () => {
  it("says Auto-tracked, in the dark badge that shows on the lime row", () => {
    const html = renderToStaticMarkup(createElement(AutoTrackedBadge));

    expect(html).toContain("Auto-tracked");
    expect(html).toContain("bg-foreground");
    expect(html).toContain("text-background");
  });

  it("keeps its explanation out of the page until it is hovered", () => {
    expect(renderToStaticMarkup(createElement(AutoTrackedBadge))).not.toContain("Posted on Callback");
  });
});
