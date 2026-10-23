import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson, SITE_INTERVAL_MS } from "../http";
import { cleanText, shortHash } from "../text";
import type { BoardAdapter } from "./board";

// The newest postings only, in one response.
const API = "https://www.workingnomads.com/api/exposed_jobs/";

const jobsSchema = z.array(
  z.object({
    url: z.string(),
    title: z.string(),
    company_name: z.string(),
    category_name: z.string().nullish(),
    // "Anywhere", "Europe", "USA"
    location: z.string().nullish(),
    description: z.string().nullish(),
    pub_date: z.string().nullish(),
  }),
);

export const workingnomads: BoardAdapter = {
  name: "workingnomads",

  async fetchJobs() {
    const res = await getJson(API, { intervalMs: SITE_INTERVAL_MS, retries: 2 });
    expectOk(res.status, "workingnomads");
    return jobsSchema.parse(res.data).map((job) => ({
      externalId: /\/(\d+)\/?$/.exec(job.url)?.[1] ?? shortHash(job.url),
      title: cleanText(job.title),
      companyName: cleanText(job.company_name),
      url: job.url,
      location: job.location ?? null,
      remote: true,
      department: job.category_name ?? null,
      postedAt: job.pub_date ?? null,
      description: htmlToText(job.description),
    }));
  },
};
