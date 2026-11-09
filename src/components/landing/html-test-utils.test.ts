import { describe, expect, it } from "vitest";
import { asRenderedHtml } from "./html-test-utils";

describe("asRenderedHtml", () => {
  it("writes the five characters React escapes as character references", () => {
    expect(asRenderedHtml(`Tom & "Jerry" <3 it's`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;3 it&#x27;s");
    expect(asRenderedHtml("a > b")).toBe("a &gt; b");
  });

  it("leaves text without them alone", () => {
    expect(asRenderedHtml("Plain words, 100%.")).toBe("Plain words, 100%.");
  });
});
