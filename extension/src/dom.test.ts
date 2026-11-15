// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cleanText, firstElement, firstElementByLabel, firstText, orNull, outermostSameBoxWrapper } from "./dom";
import { documentFrom } from "./test-support/fixtures";
import { giveBox } from "./test-support/layout";

describe("cleanText", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanText("  Senior \n\t Engineer ")).toBe("Senior Engineer");
    expect(cleanText(null)).toBe("");
    expect(cleanText(undefined)).toBe("");
  });
});

describe("orNull", () => {
  it("is the cleaned text, or null when there is none", () => {
    expect(orNull(" Acme ")).toBe("Acme");
    expect(orNull("   ")).toBeNull();
    expect(orNull(null)).toBeNull();
  });
});

describe("firstElement and firstText", () => {
  const doc = documentFrom('<body><p class="old">Old</p><p class="new">  New  </p><p class="empty"> </p></body>');

  it("try the selectors in the order they are listed", () => {
    expect(firstElement(doc, [".missing", ".new", ".old"])?.className).toBe("new");
    expect(firstText(doc, [".missing", ".new", ".old"])).toBe("New");
    expect(firstText(doc, [".old", ".new"])).toBe("Old");
  });

  it("skip an element with no text for the next one", () => {
    expect(firstText(doc, [".empty", ".old"])).toBe("Old");
  });

  it("are null when nothing matches", () => {
    expect(firstElement(doc, [".missing"])).toBeNull();
    expect(firstText(doc, [".missing", ".empty"])).toBeNull();
  });
});

describe("firstElementByLabel", () => {
  const doc = documentFrom(
    '<body><button aria-label="Save the job" id="save">x</button><button aria-label="  Easy   Apply to this job " id="first">x</button><a href="#" aria-label="Apply" id="second">x</a><p aria-label="Apply" id="paragraph">x</p></body>',
  );

  it("is the first element in the page, of those the selector finds, whose label matches", () => {
    expect(firstElementByLabel(doc, "button[aria-label], a[aria-label]", /^(?:easy\s+)?apply\b/i)?.id).toBe("first");
    expect(firstElementByLabel(doc, "a[aria-label]", /^apply$/i)?.id).toBe("second");
  });

  it("looks only at what the selector finds", () => {
    expect(firstElementByLabel(doc, "p", /^apply$/i)?.id).toBe("paragraph");
    expect(firstElementByLabel(doc, "button", /^apply$/i)).toBeNull();
  });

  it("is null when nothing matches or nothing has a label", () => {
    expect(firstElementByLabel(doc, "button, a", /^delete/i)).toBeNull();
    expect(firstElementByLabel(documentFrom("<body><button>Apply</button></body>"), "button", /apply/i)).toBeNull();
  });
});

describe("outermostSameBoxWrapper", () => {
  // <body> > row > outer > inner > control, and a second control in the row beside the wrapper.
  function pageWithWrappers() {
    const doc = documentFrom(
      '<body><div id="row"><span id="outer"><span id="inner"><a id="control">Apply</a></span></span><button id="save">Save</button></div></body>',
    );
    const find = (id: string): Element => {
      const element = doc.getElementById(id);
      if (!element) throw new Error(`no #${id} in the test page`);
      return element;
    };
    return { doc, row: find("row"), outer: find("outer"), inner: find("inner"), control: find("control") };
  }

  it("climbs through wrappers of the control's size, to the outermost of them", () => {
    const { row, outer, inner, control } = pageWithWrappers();
    giveBox(control, 168, 48);
    giveBox(inner, 168, 48);
    giveBox(outer, 168, 48);
    giveBox(row, 400, 48);

    expect(outermostSameBoxWrapper(control)).toBe(outer);
  });

  it("counts a wrapper a few pixels larger, for a border or a rounding, as the same box", () => {
    const { row, outer, inner, control } = pageWithWrappers();
    giveBox(control, 168, 48);
    giveBox(inner, 170, 50);
    giveBox(outer, 172, 52);
    giveBox(row, 400, 48);

    expect(outermostSameBoxWrapper(control)).toBe(outer);
  });

  it("stops at a parent that is wider, such as a row with another button in it", () => {
    const { row, outer, inner, control } = pageWithWrappers();
    giveBox(control, 168, 48);
    giveBox(inner, 168, 48);
    giveBox(outer, 280, 48);
    giveBox(row, 400, 48);

    expect(outermostSameBoxWrapper(control)).toBe(inner);
  });

  it("stops at a parent that is taller, and at one that is smaller", () => {
    const { row, outer, inner, control } = pageWithWrappers();
    giveBox(control, 168, 48);
    giveBox(inner, 168, 48);
    giveBox(outer, 168, 90);
    giveBox(row, 400, 90);
    expect(outermostSameBoxWrapper(control)).toBe(inner);

    giveBox(outer, 168, 48);
    giveBox(inner, 100, 48);
    expect(outermostSameBoxWrapper(control)).toBe(control);
  });

  it("is the element itself when it has no wrapper of its size", () => {
    const { row, outer, inner, control } = pageWithWrappers();
    giveBox(control, 168, 48);
    giveBox(inner, 400, 48);
    giveBox(outer, 400, 48);
    giveBox(row, 400, 48);

    expect(outermostSameBoxWrapper(control)).toBe(control);
  });

  it("doesn't climb in a page that isn't laid out, where every box is empty", () => {
    const { control } = pageWithWrappers();

    expect(outermostSameBoxWrapper(control)).toBe(control);
  });

  it("doesn't climb when the element has no box of its own, or a parent has none", () => {
    const { row, outer, inner, control } = pageWithWrappers();
    giveBox(inner, 168, 48);
    giveBox(outer, 168, 48);
    expect(outermostSameBoxWrapper(control)).toBe(control);

    giveBox(control, 168, 48);
    giveBox(inner, 0, 0);
    giveBox(row, 168, 48);
    expect(outermostSameBoxWrapper(control)).toBe(control);
  });

  it("climbs at most maxDepth levels, 4 by default", () => {
    const { row, outer, inner, control } = pageWithWrappers();
    for (const element of [control, inner, outer, row]) giveBox(element, 168, 48);
    expect(outermostSameBoxWrapper(control, 1)).toBe(inner);
    expect(outermostSameBoxWrapper(control, 2)).toBe(outer);
    expect(outermostSameBoxWrapper(control, 0)).toBe(control);

    const doc = documentFrom("<body><div><div><div><div><div><div><a id='deep'>Apply</a></div></div></div></div></div></div></body>");
    for (const element of doc.querySelectorAll("div, a")) giveBox(element, 168, 48);
    const deep = doc.getElementById("deep");
    if (!deep) throw new Error("no #deep in the test page");

    // Six wrappers of the same size: only the fourth parent up is reached.
    let fourthParentUp: Element = deep;
    for (let level = 0; level < 4; level += 1) fourthParentUp = fourthParentUp.parentElement ?? fourthParentUp;
    expect(outermostSameBoxWrapper(deep)).toBe(fourthParentUp);
  });

  it("never goes up to <body> or <html>, even when they are the same size", () => {
    const doc = documentFrom("<body><a id='control'>Apply</a></body>");
    const control = doc.getElementById("control");
    if (!control) throw new Error("no #control in the test page");
    giveBox(control, 168, 48);
    giveBox(doc.body, 168, 48);
    giveBox(doc.documentElement, 168, 48);

    expect(outermostSameBoxWrapper(control)).toBe(control);
  });

  it("is the element itself when it has no parent", () => {
    const doc = documentFrom("<body></body>");
    const loose = doc.createElement("a");
    giveBox(loose, 168, 48);

    expect(outermostSameBoxWrapper(loose)).toBe(loose);
  });
});
