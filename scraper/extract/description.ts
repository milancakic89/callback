import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { cleanText } from "../text";
import { asRecord, asString } from "./json";

const MAX_CHARS = 15_000;
const BLOCK_SELECTOR = "p, div, li, h1, h2, h3, h4, h5, h6, ul, ol, tr, blockquote";
const DOUBLE_ENCODED = /&lt;\/?[a-z][a-z0-9]*(&gt;|\s)/i;
// Unrendered template placeholders some ATS widgets leave in when fetched without running their JS.
const TEMPLATE_PLACEHOLDER = /%[A-Z][A-Z0-9_]{2,40}%/g;

// A bullet whose text turned out to be only a template placeholder becomes "•"; drop it.
function blockText(el: cheerio.Cheerio<AnyNode>): string | null {
  const text = cleanText(el.text().replace(TEMPLATE_PLACEHOLDER, ""));
  return text && text !== "•" ? text : null;
}

// HTML job descriptions → plain text, one blank line between paragraphs/list items.
export function htmlToText(html: string | null | undefined): string | null {
  if (!html?.trim()) return null;
  // Greenhouse (and some others) entity-escape their HTML content an extra time, so the first
  // parse sees no real tags, just text that happens to read "<p>...". Decode once more first.
  const input = DOUBLE_ENCODED.test(html) ? cheerio.load(html).text() : html;
  const $ = cheerio.load(input);
  $("script, style, noscript").remove();
  $("li").prepend("• ");
  $("br").replaceWith("\n");
  const blocks: string[] = [];
  $(BLOCK_SELECTOR).each((_, element) => {
    const el = $(element);
    // Leaf blocks only: a <div> that wraps <p>s would otherwise duplicate their text.
    if (el.children(BLOCK_SELECTOR).length > 0) return;
    const text = blockText(el);
    if (text) blocks.push(text);
  });
  const text = (blocks.length ? blocks.join("\n\n") : blockText($.root())) ?? "";
  if (!text) return null;
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text;
}

export function collectJobPostings(node: unknown, out: Record<string, unknown>[]): void {
  const items = Array.isArray(node) ? node : [node];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
    if (types.includes("JobPosting")) out.push(record);
    if (record["@graph"]) collectJobPostings(record["@graph"], out);
  }
}

// schema.org JobPosting embedded in a single job page (Breezy, many custom career sites).
export function extractJsonLdDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const postings: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      collectJobPostings(JSON.parse($(element).text()), postings);
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  });
  for (const posting of postings) {
    const text = htmlToText(asString(posting.description));
    if (text) return text;
  }
  return null;
}

const REMOVE_SELECTOR =
  "script, style, noscript, svg, nav, header, footer, form, button, iframe, " +
  "[class*=cookie i], [class*=navigation i], [class*=breadcrumb i], [class*=sidebar i], " +
  "[class*=gallery i], [class*=share i], [class*=social i], [class*=apply-button i], " +
  "ul[class*=action i], [class*=related-job i], [class*=similar-job i]";
// Picks whichever element looks most like "the job description", not chrome around it.
const CANDIDATE_SELECTOR =
  "[class*=description i], [class*=job-content i], [class*=jobcontent i], [class*=posting i], " +
  "[class*=job-detail i], [class*=job-body i], [id*=description i], [itemprop=description i], article, main";
const MIN_CANDIDATE_CHARS = 200;

// Best-effort fallback for pages with no API and no JSON-LD: the largest "description-ish" block.
export function extractMainContentText(html: string): string | null {
  const $ = cheerio.load(html);
  $(REMOVE_SELECTOR).remove();

  const candidates: string[] = [];
  $(CANDIDATE_SELECTOR).each((_, element) => {
    const text = htmlToText($.html(element));
    if (text && text.length >= MIN_CANDIDATE_CHARS) candidates.push(text);
  });
  if (candidates.length) return candidates.sort((a, b) => b.length - a.length)[0];

  const bodyText = htmlToText($("body").length ? $.html($("body")) : $.html());
  return bodyText && bodyText.length >= MIN_CANDIDATE_CHARS ? bodyText : null;
}
