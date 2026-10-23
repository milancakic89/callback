import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson, SITE_INTERVAL_MS } from "../http";
import { cleanText } from "../text";
import type { BoardAdapter, BoardJob } from "./board";

// v2 filters by country server-side ("office or remote-allowed country"), so this is the whole
// list open to Serbia: ~30 postings, against 26,000 in the unfiltered feed. 60 requests/min per IP;
// the docs ask for a link back to 4dayweek.io, which every posting's url is.
const API = "https://4dayweek.io/api/v2/jobs";
const LIMIT = 100;
const MAX_PAGES = 20;

const pageSchema = z.object({
  has_more: z.boolean(),
  data: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      url: z.string(),
      category: z.string().nullish(),
      description: z.string().nullish(),
      // "remote", "hybrid", "onsite"
      work_arrangement: z.string().nullish(),
      locations: z
        .array(z.object({ city: z.string().nullish(), country: z.string().nullish(), continent: z.string().nullish() }))
        .nullish(),
      posted_at: z.string().nullish(),
      // Missing on some postings; those are skipped, as dedupe needs a company.
      company: z.object({ name: z.string() }).nullish(),
    }),
  ),
});

export const fourdayweek: BoardAdapter = {
  name: "fourdayweek",

  async fetchJobs() {
    const jobs: BoardJob[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query = new URLSearchParams({
        country: "Serbia",
        work_arrangement: "remote,hybrid,onsite",
        limit: String(LIMIT),
        page: String(page),
      });
      const res = await getJson(`${API}?${query}`, { intervalMs: SITE_INTERVAL_MS, retries: 2 });
      expectOk(res.status, `4dayweek page ${page}`);
      const data = pageSchema.parse(res.data);
      for (const job of data.data) {
        if (!job.company?.name) continue;
        const places = (job.locations ?? []).map((l) => l.country ?? l.continent).filter((p): p is string => Boolean(p));
        const cities = (job.locations ?? []).map((l) => [l.city, l.country].filter(Boolean).join(", "));
        jobs.push({
          externalId: job.slug,
          title: cleanText(job.title),
          companyName: cleanText(job.company.name),
          url: job.url,
          location: cities.length <= 3 ? cities.join(" / ") || null : `${places.slice(0, 3).join(", ")} + ${places.length - 3} more`,
          allowedPlaces: places.length ? places : undefined,
          remote: job.work_arrangement === "remote",
          department: job.category ?? null,
          postedAt: job.posted_at ?? null,
          description: htmlToText(job.description),
        });
      }
      if (!data.has_more) return jobs;
    }
    throw new Error(`4dayweek: still more pages after ${MAX_PAGES}`);
  },
};
