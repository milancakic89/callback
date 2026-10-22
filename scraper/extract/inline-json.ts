import * as cheerio from "cheerio";
import type { CapturedJson } from "./network-json";

// `window.x = {`, `phApp.ddo = {`, `var data = [`: the JSON starts right after the match.
const ASSIGNMENT = /(?:^|[;\s,(])(?:window\.|var |let |const )?[\w$.]{2,60}\s*=\s*(?=[{[])/g;
const MAX_SCRIPT_CHARS = 3_000_000;
const MAX_ATTEMPTS_PER_SCRIPT = 50;

// The JSON object or array starting at `start`, or null if it never closes.
function balancedJson(text: string, start: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// Data that SPAs ship inside the HTML: __NEXT_DATA__, __NUXT__-style globals, Phenom's phApp.ddo...
export function extractInlineJson(html: string, pageUrl: string): CapturedJson[] {
  const $ = cheerio.load(html);
  const found: CapturedJson[] = [];
  const tryParse = (text: string) => {
    try {
      found.push({ url: pageUrl, body: JSON.parse(text) });
    } catch {
      // A JS object literal, not JSON.
    }
  };

  $("script:not([src])").each((_, element) => {
    const type = $(element).attr("type") ?? "";
    const text = $(element).text();
    if (!text || text.length > MAX_SCRIPT_CHARS || /ld\+json/i.test(type)) return;
    if (/json/i.test(type)) {
      tryParse(text);
      return;
    }
    if (type && !/javascript|module/i.test(type)) return;
    let attempts = 0;
    for (const match of text.matchAll(ASSIGNMENT)) {
      if (++attempts > MAX_ATTEMPTS_PER_SCRIPT) break;
      const json = balancedJson(text, (match.index ?? 0) + match[0].length);
      if (json && json.length >= 200) tryParse(json);
    }
  });
  return found;
}
