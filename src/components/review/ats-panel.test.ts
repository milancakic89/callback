import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NoAutoRejectNote, ReviewActions } from "./ats-panel";

describe("ReviewActions", () => {
  const render = (props: { applyButton?: React.ReactNode; compact?: boolean } = {}) =>
    renderToStaticMarkup(createElement(ReviewActions, { liked: false, onLike: vi.fn(), onNext: vi.fn(), ...props }));

  it("has the heart and Next", () => {
    const html = render();

    expect(html).toContain("Like this candidate");
    expect(html).toContain("Next");
  });

  it("shows the Apply statuses button it is given, under Next", () => {
    const html = render({ applyButton: createElement("button", null, "Apply statuses") });

    expect(html.indexOf("Next")).toBeLessThan(html.indexOf("Apply statuses"));
  });

  it("shows the keys on desktop and not in the phone bar", () => {
    expect(render()).toContain("<kbd");
    expect(render({ compact: true })).not.toContain("<kbd");
  });
});

describe("NoAutoRejectNote", () => {
  it("says candidates see a status only after it is applied", () => {
    const html = renderToStaticMarkup(createElement(NoAutoRejectNote));

    expect(html).toContain("Nothing is rejected automatically");
    expect(html).toContain("see a new status only after");
    expect(html).not.toContain("doesn");
  });
});
