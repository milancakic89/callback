import * as cheerio from "cheerio";
import { absoluteUrl, cleanText, shortHash } from "../text";
import type { RawJob } from "../types";
import { htmlToText } from "./description";
import { asArray, asRecord, asString, firstString } from "./json";

function placeOf(value: unknown): { text: string | null; country: string | null } {
  const parts: string[] = [];
  let country: string | null = null;
  for (const item of asArray(value)) {
    const address = asRecord(asRecord(item)?.address) ?? asRecord(item);
    if (!address) continue;
    const countryValue = asString(address.addressCountry) ?? asString(asRecord(address.addressCountry)?.name);
    if (countryValue && countryValue.length === 2) country ??= countryValue.toLowerCase();
    const line = [asString(address.addressLocality), asString(address.addressRegion), countryValue]
      .filter(Boolean)
      .join(", ");
    if (line) parts.push(line);
  }
  return { text: parts.length ? [...new Set(parts)].join(" / ") : null, country };
}

function collectPostings(node: unknown, out: Record<string, unknown>[]): void {
  for (const item of asArray(node)) {
    const record = asRecord(item);
    if (!record) continue;
    if (asArray(record["@type"]).includes("JobPosting")) out.push(record);
    if (record["@graph"]) collectPostings(record["@graph"], out);
    if (record.itemListElement) collectPostings(record.itemListElement, out);
    if (record.item) collectPostings(record.item, out);
  }
}

// schema.org JobPosting, as sites embed it for Google Jobs.
export function extractJsonLdJobs(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  const postings: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      collectPostings(JSON.parse($(element).text()), postings);
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  });
  return postings
    .map((posting): RawJob | null => {
      const title = cleanText(firstString(posting, ["title", "name"]));
      if (!title) return null;
      const url = absoluteUrl(asString(posting.url), pageUrl);
      const place = placeOf(posting.jobLocation);
      const identifier = asString(asRecord(posting.identifier)?.value) ?? asString(posting.identifier);
      return {
        externalId: identifier ?? shortHash(url ?? `${pageUrl}#${title}`),
        title,
        url,
        location: place.text,
        countryCode: place.country,
        remote: asString(posting.jobLocationType) === "TELECOMMUTE" ? true : null,
        department: null,
        postedAt: asString(posting.datePosted),
        description: htmlToText(asString(posting.description)),
      };
    })
    .filter((job): job is RawJob => job !== null);
}
