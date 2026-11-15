import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RemoveExternalButton } from "./remove-external-button";

const render = (props: { disabled?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(RemoveExternalButton, {
      jobTitle: "Data Engineer",
      companyName: "Gamma",
      sourceLabel: "LinkedIn",
      onConfirm: vi.fn(),
      ...props,
    }),
  );

describe("RemoveExternalButton", () => {
  it("is a button that says which job it removes", () => {
    const html = render();

    expect(html).toContain('aria-label="Remove &quot;Data Engineer&quot; from your applications"');
    expect(html).toContain('type="button"');
  });

  it("keeps the confirmation closed until it is pressed", () => {
    const html = render();

    expect(html).not.toContain("Remove this job?");
    expect(html).not.toContain("Nothing changes on LinkedIn");
  });

  it("can be disabled while the row is being saved", () => {
    expect(render({ disabled: true })).toContain('disabled=""');
    expect(render()).not.toContain('disabled=""');
  });
});
