// Reading text and elements off a page, for the adapters. The selectors of a site are kept in ordered
// lists, most specific first, so that a change on the site is a line added to its list.

export function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// The first element any of the selectors finds, in the order they are listed.
export function firstElement(root: ParentNode, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
}

// The first element the selector finds, in the page's order, whose aria-label the pattern matches. For a
// control a site gives no stable class, but does give a label.
export function firstElementByLabel(root: ParentNode, selector: string, label: RegExp): Element | null {
  for (const element of root.querySelectorAll(selector)) {
    if (label.test(cleanText(element.getAttribute("aria-label")))) return element;
  }
  return null;
}

// How much larger, in pixels, a wrapper's box may be than the control's and still count as the same box:
// a border, a focus ring, or a rounding of the layout.
const SAME_BOX_TOLERANCE_PX = 4;

// A site often wraps its button in an element of the same size, which clips or stacks what is put next to
// the button inside it. Something that has to be seen next to the button goes after the outermost such
// wrapper instead. Going up from the element, a parent is the same box when it and the element both have a
// width and a height, and the parent is within a few pixels of the element's size; it stops at the first
// parent that isn't, at <body>, and after `maxDepth` levels. Every parent is compared with the element's
// own box, so a chain of wrappers that each grow a little doesn't carry it far from the control. In a page
// that isn't laid out every box is empty, so the element comes back as it is.
export function outermostSameBoxWrapper(element: Element, maxDepth = 4): Element {
  const elementBox = element.getBoundingClientRect();
  if (elementBox.width <= 0 || elementBox.height <= 0) return element;

  let outermost = element;
  for (let level = 0; level < maxDepth; level += 1) {
    const parent: Element | null = outermost.parentElement;
    if (!parent || parent === element.ownerDocument.body || parent === element.ownerDocument.documentElement) break;
    const parentBox = parent.getBoundingClientRect();
    const sameBox =
      parentBox.width > 0 &&
      parentBox.height > 0 &&
      Math.abs(parentBox.width - elementBox.width) <= SAME_BOX_TOLERANCE_PX &&
      Math.abs(parentBox.height - elementBox.height) <= SAME_BOX_TOLERANCE_PX;
    if (!sameBox) break;
    outermost = parent;
  }
  return outermost;
}

// The text of the first element that has some, in the order the selectors are listed.
export function firstText(root: ParentNode, selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    for (const element of root.querySelectorAll(selector)) {
      const text = cleanText(element.textContent);
      if (text) return text;
    }
  }
  return null;
}

// The cleaned text, or null when there is none.
export function orNull(value: string | null | undefined): string | null {
  const text = cleanText(value);
  return text || null;
}
