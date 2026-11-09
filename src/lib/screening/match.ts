// The keyword matcher behind the screening (features/cv-screening.md): whether a job's filter
// ("React", "Design systems", "English C1") is in a CV's text. Pure and dependency-free. It matches
// words, never meaning: the review screen says so.
import { escapeRegExp, wordBounded } from "@/lib/jobs/filter";
import { canonText } from "./canon";
import type { FilterVerdict } from "./engine";
import { synonymsOf } from "./synonyms";

// What a PDF's extracted text needs before canonText(): a heading set in wide letter-spacing comes
// out as "P R O F I L E" (capitals only, four or more: "I a m a" is left alone), and a word broken across lines as "de-\nsign" (normalizeText would turn it
// into "de sign"); both are put back together.
export function prepareCvText(raw: string): string {
  const joined = raw
    .replace(/(?<![\p{L}\p{N}])(?:\p{Lu} ){3,}\p{Lu}(?![\p{L}\p{N}])/gu, (spaced) => spaced.replaceAll(" ", ""))
    .replace(/(\p{L})-[ \t]*\r?\n[ \t]*(\p{L})/gu, "$1$2");
  return canonText(joined);
}

// A filter that is a quantity, which words in a CV can't decide: "5+ years", "3 godine iskustva",
// "at least 2 yrs". The reviewer reads the CV for it.
const QUANTITY = /\d\s*\+?\s*(?:years?|yrs?|yr|godin\w*|god)\b|\d+\s*\+?\s*(?:months?|meseci\w*)\b/u;

export function isQuantityFilter(label: string): boolean {
  return QUANTITY.test(canonText(label));
}

// A word of six letters or more may carry an ending in the CV ("mentoring" / "mentored" / "mentor"):
// the stem is kept and the common endings are allowed after it. Shorter words, which are most tech
// names ("react", "figma", "agile"), match only as they are, so "React" is not found in "reacted".
const SUFFIXES = ["ing", "ed", "es", "s"];
const ENDINGS = "(?:s|es|ed|ing|e|d)?";
const MIN_FLEX_LENGTH = 6;
const MIN_STEM_LENGTH = 5;

function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_STEM_LENGTH) return word.slice(0, -suffix.length);
  }
  return word;
}

function wordPattern(word: string): string {
  if (word.length < MIN_FLEX_LENGTH || !/^\p{L}+$/u.test(word)) return escapeRegExp(word);
  return `${escapeRegExp(stem(word))}${ENDINGS}`;
}

// A name that doesn't end in a symbol is not found in the one that does: "c" is not "c++" or "c#".
function phraseRegExp(canonPhrase: string): RegExp {
  const source = canonPhrase.split(" ").map(wordPattern).join(" ");
  return wordBounded(/[+#]$/.test(canonPhrase) ? source : `${source}(?![+#])`);
}

// Whether `label` is in `cvText` (already through prepareCvText), or can't be decided.
export function matchFilter(label: string, cvText: string): FilterVerdict {
  if (isQuantityFilter(label)) return "unverified";
  const canon = canonText(label);
  // A label with no letters or digits at all ("!!!") says nothing to look for.
  if (!/[\p{L}\p{N}]/u.test(canon)) return "unverified";

  const variants = [canon, ...synonymsOf(canon)];
  return variants.some((variant) => phraseRegExp(variant).test(cvText)) ? "met" : "missing";
}

// One verdict for each label, keyed by the label as the job spells it.
export function matchFilters(labels: readonly string[], rawCvText: string): Record<string, FilterVerdict> {
  const cvText = prepareCvText(rawCvText);
  return Object.fromEntries(labels.map((label) => [label, matchFilter(label, cvText)]));
}
