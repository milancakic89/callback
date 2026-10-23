import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson, SITE_INTERVAL_MS } from "../http";
import { cleanText, shortHash } from "../text";
import type { BoardAdapter, BoardJob } from "./board";

// `country` also returns worldwide postings unless `exclude_worldwide` is set, so this one query is
// "open to Serbia": worldwide, plus country lists that include Serbia. See features/job-boards.md.
const API = "https://himalayas.app/jobs/api/search?country=RS";
// Fixed by the API.
const PAGE_SIZE = 20;
const MAX_PAGES = 1000;

const pageSchema = z.object({
  totalCount: z.number(),
  jobs: z.array(
    z.object({
      title: z.string(),
      companyName: z.string(),
      locationRestrictions: z.array(z.string()).nullish(),
      timezoneRestrictions: z.array(z.number()).nullish(),
      parentCategories: z.array(z.string()).nullish(),
      description: z.string().nullish(),
      // Unix seconds.
      pubDate: z.number().nullish(),
      expiryDate: z.number().nullish(),
      applicationLink: z.string().nullish(),
      guid: z.string(),
    }),
  ),
});

// "https://himalayas.app/companies/acme/jobs/backend-engineer" → "acme/backend-engineer"
function externalId(guid: string): string {
  const match = /\/companies\/([^/]+)\/jobs\/([^/?#]+)/.exec(guid);
  return match ? `${match[1]}/${match[2]}` : shortHash(guid);
}

// A Europe-wide posting lists ~40 countries; show the one that matters here.
function describePlaces(places: string[]): string {
  if (!places.length) return "Worldwide";
  if (places.length <= 3) return places.join(", ");
  const first = places.includes("Serbia") ? "Serbia" : places[0];
  return `${first} + ${places.length - 1} more countries`;
}

export const himalayas: BoardAdapter = {
  name: "himalayas",

  async fetchJobs() {
    // Optional: without a key, every caller shares one public allowance.
    const key = process.env.HIMALAYAS_API_KEY;
    const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
    const jobs = new Map<string, BoardJob>();
    let total = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      // No cursor on search; pages are 1-based and come back empty past the end.
      const res = await getJson(`${API}&page=${page}`, { headers, intervalMs: SITE_INTERVAL_MS, retries: 3 });
      expectOk(res.status, `himalayas page ${page}`);
      const data = pageSchema.parse(res.data);
      total = data.totalCount;
      for (const job of data.jobs) {
        if (job.expiryDate && job.expiryDate * 1000 < Date.now()) continue;
        const places = job.locationRestrictions ?? [];
        jobs.set(externalId(job.guid), {
          externalId: externalId(job.guid),
          title: cleanText(job.title),
          companyName: cleanText(job.companyName),
          url: job.applicationLink ?? job.guid,
          location: describePlaces(places),
          allowedPlaces: places.length ? places : ["Worldwide"],
          utcOffsets: job.timezoneRestrictions ?? [],
          remote: true,
          department: job.parentCategories?.[0] ?? null,
          postedAt: job.pubDate ? String(job.pubDate) : null,
          description: htmlToText(job.description),
        });
      }
      // Not `< PAGE_SIZE`: a page in the middle can come back short (page 156 of 182 had 12).
      if (!data.jobs.length || page * PAGE_SIZE >= total + PAGE_SIZE) break;
    }

    // Expired postings are skipped above, so allow some slack, but a feed that stopped far short
    // of its own total (a capped page, a changed API) must not close everything past that point.
    if (jobs.size < total * 0.9) {
      throw new Error(`himalayas: only ${jobs.size} of ${total} jobs read`);
    }
    return [...jobs.values()];
  },
};
