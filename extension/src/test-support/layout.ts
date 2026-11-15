// happy-dom does no layout: every box is empty. A test that depends on the size of an element gives it one.
export function giveBox(element: Element, width: number, height: number): void {
  element.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
}
