import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useHydrated } from "./use-hydrated";

function Probe() {
  return createElement("span", null, String(useHydrated()));
}

describe("useHydrated", () => {
  it("is false in the server's markup, the one a browser hydrates", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>false</span>");
  });
});
