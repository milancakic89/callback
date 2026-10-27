import * as cheerio from "cheerio";
import { collectJobPostings } from "./description";
import { asString } from "./json";

const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-10-22", "2026-10-22T09:30:00Z", "2026-10-22 09:30:00 UTC", "2026-10-22T09:30:00+02:00" or
// "+0200". Without a zone it is UTC, as `toTimestamp` (scraper/supabase.ts) reads it.
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?\s*(Z|UTC|[+-]\d{2}(?::?\d{2})?)?$/i;
// Java's Date.toString(), which SAP SuccessFactors writes: "Thu Oct 01 02:00:00 UTC 2026".
const JAVA_DATE = /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{2}:\d{2}:\d{2} UTC \d{4}$/;

// An ISO timestamp for a posting date a page or an API gave, or null. Strict on purpose: a job with
// no date shows when the scraper first saw it, which is honest, while a wrongly read date is not.
// So "01.10.2026" (1 October or 10 January?) and "Oct 1, 2026" (read in whatever zone the machine is
// in) are refused rather than guessed, and so is a day that doesn't exist (`Date.parse` turns
// 31 February into 3 March), a year before 2000, and a date more than a day ahead.
export function normalizePostedAt(value: unknown, now = Date.now()): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  let time = Number.NaN;

  const iso = ISO.exec(text);
  if (iso) {
    const [, year, month, day, clock, zone] = iso;
    const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (calendar.getUTCMonth() !== Number(month) - 1 || calendar.getUTCDate() !== Number(day)) return null;
    const offset = !zone || /^(z|utc)$/i.test(zone) ? "Z" : zone.length === 3 ? `${zone}:00` : zone.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
    const withSeconds = clock ? (clock.length === 5 ? `${clock}:00` : clock) : "00:00:00";
    time = Date.parse(`${year}-${month}-${day}T${withSeconds}${offset}`);
  } else if (JAVA_DATE.test(text)) {
    time = Date.parse(text);
  }

  if (Number.isNaN(time)) return null;
  const date = new Date(time);
  if (date.getUTCFullYear() < 2000 || time > now + DAY_MS) return null;
  return date.toISOString();
}

// The posting date on a single job's page, as Google for Jobs wants it published: schema.org
// JobPosting `datePosted` in JSON-LD, else `itemprop="datePosted"` (SuccessFactors). A `<time>` tag
// is not used: it could as well be a closing date or the page's own. A page that gives two different
// dates is probably a list of jobs, and which one is ours isn't known, so it counts as none.
export function extractPostedAt(html: string, now = Date.now()): string | null {
  const $ = cheerio.load(html);

  const fromJsonLd = new Set<string>();
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const postings: Record<string, unknown>[] = [];
      collectJobPostings(JSON.parse($(element).text()), postings);
      for (const posting of postings) {
        const date = normalizePostedAt(asString(posting.datePosted), now);
        if (date) fromJsonLd.add(date);
      }
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  });
  if (fromJsonLd.size) return fromJsonLd.size === 1 ? [...fromJsonLd][0] : null;

  const fromMicrodata = new Set<string>();
  $('[itemprop="datePosted"]').each((_, element) => {
    const node = $(element);
    const date = normalizePostedAt(node.attr("content") ?? node.attr("datetime") ?? node.text(), now);
    if (date) fromMicrodata.add(date);
  });
  return fromMicrodata.size === 1 ? [...fromMicrodata][0] : null;
}
