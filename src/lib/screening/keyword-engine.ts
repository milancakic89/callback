import "server-only";
import type { ScreeningEngine } from "./engine";
import { matchFilters } from "./match";
import { extractPdfText } from "./pdf-text";

// The free engine (features/cv-screening.md): the CV's text, read with pdf.js, against each filter's
// words (src/lib/screening/match.ts). No network, no account, no model; the CV's text is used for
// the check and not kept.

// Fewer letters than this is not a CV's text: a scan (no text layer), or a page of symbols.
const MIN_LETTERS = 40;

function letterCount(text: string): number {
  return (text.match(/\p{L}/gu) ?? []).length;
}

export const keywordEngine: ScreeningEngine = {
  id: "keywords-v1",

  async screen(cv, filters) {
    let text: string;
    try {
      text = await extractPdfText(cv.bytes);
    } catch (error) {
      // A damaged or encrypted file, or one that took too long: the reviewer reads it instead.
      console.error("keyword screening: could not read", cv.fileName, error);
      return { kind: "unreadable" };
    }
    if (letterCount(text) < MIN_LETTERS) return { kind: "unreadable" };

    return { kind: "checked", verdicts: matchFilters([...filters.required, ...filters.optional], text) };
  },
};
