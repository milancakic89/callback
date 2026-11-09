// React writes `'` and `"` (and `&`, `<`, `>`) in text and attributes as character references, so a
// sentence with an apostrophe never appears word for word in the markup a render test reads.
// Turn the expected text into what the markup holds before looking for it.
const HTML_CHARACTER_REFERENCES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

export function asRenderedHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_CHARACTER_REFERENCES[character]);
}
