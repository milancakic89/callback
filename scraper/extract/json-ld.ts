import * as cheerio from "cheerio";
import { absoluteUrl, cleanText, shortHash } from "../text";
import type { RawJob } from "../types";
import { htmlToText } from "./description";
import { asRecord, asString, firstString } from "./json";
import { jobPostingsFromScripts, postingPlace } from "./job-postings";

// schema.org JobPosting, as sites embed it for Google Jobs.
export function extractJsonLdJobs(html: string, pageUrl: string): RawJob[] {
  const $ = cheerio.load(html);
  const scriptTexts = $('script[type="application/ld+json"]')
    .map((_, element) => $(element).text())
    .get();
  return jobPostingsFromScripts(scriptTexts)
    .map((posting): RawJob | null => {
      const title = cleanText(firstString(posting, ["title", "name"]));
      if (!title) return null;
      const url = absoluteUrl(asString(posting.url), pageUrl);
      const place = postingPlace(posting.jobLocation);
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
