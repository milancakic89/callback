import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson, SITE_INTERVAL_MS } from "../http";
import { cleanText } from "../text";
import type { BoardAdapter, BoardJob } from "./board";

// Mostly Germany, from ATS feeds. Its "Remote" postings are nearly always remote within Germany or
// a neighbor (a Dutch heat-pump fitter, "German Defense" pre-sales), so only Serbian places count.
const API = "https://www.arbeitnow.com/api/job-board-api";
const MAX_PAGES = 100;

const pageSchema = z.object({
  data: z.array(
    z.object({
      slug: z.string(),
      company_name: z.string(),
      title: z.string(),
      // Entity-escaped HTML; htmlToText decodes it.
      description: z.string().nullish(),
      remote: z.boolean().nullish(),
      url: z.string(),
      location: z.string().nullish(),
      // Unix seconds.
      created_at: z.number().nullish(),
    }),
  ),
  links: z.object({ next: z.string().nullish() }),
});

export const arbeitnow: BoardAdapter = {
  name: "arbeitnow",

  async fetchJobs() {
    const jobs: BoardJob[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await getJson(`${API}?page=${page}`, { intervalMs: SITE_INTERVAL_MS, retries: 2 });
      expectOk(res.status, `arbeitnow page ${page}`);
      const data = pageSchema.parse(res.data);
      for (const job of data.data) {
        jobs.push({
          externalId: job.slug,
          title: cleanText(job.title),
          companyName: cleanText(job.company_name),
          url: job.url,
          location: job.location ?? null,
          remote: job.remote === true,
          serbiaOnly: true,
          department: null,
          postedAt: job.created_at ? String(job.created_at) : null,
          description: htmlToText(job.description),
        });
      }
      if (!data.links.next) return jobs;
    }
    throw new Error(`arbeitnow: still more pages after ${MAX_PAGES}`);
  },
};
