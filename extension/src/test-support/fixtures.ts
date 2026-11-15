import { readFileSync } from "node:fs";
import path from "node:path";

// A saved page from src/sites/__fixtures__, parsed into a Document of its own (the tests that use it run
// in happy-dom, which has DOMParser). Nothing in it is run: scripts stay text.
export function loadFixture(name: string): Document {
  const html = readFileSync(path.join(import.meta.dirname, "..", "sites", "__fixtures__", name), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

export function documentFrom(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}
