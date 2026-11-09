import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/applications/actions", () => ({ withdrawMyApplication: vi.fn() }));

import { WithdrawButton } from "./withdraw-button";

const render = () =>
  renderToStaticMarkup(
    createElement(WithdrawButton, { applicationId: "app-1", jobTitle: "Product Designer", companyName: "Acme" }),
  );

describe("WithdrawButton", () => {
  it("is a Withdraw button", () => {
    expect(render()).toContain("Withdraw");
  });

  it("keeps the confirmation closed until it is pressed", () => {
    const html = render();

    expect(html).not.toContain("Withdraw your application?");
    expect(html).not.toContain("loses access to your CV");
  });
});
