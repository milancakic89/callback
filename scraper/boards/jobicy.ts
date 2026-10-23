import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson, SITE_INTERVAL_MS } from "../http";
import { cleanText } from "../text";
import type { BoardAdapter, BoardJob, BoardJobStatus } from "./board";

// The public feed only covers jobs published in the last 7 days.
const API = "https://jobicy.com/api/jobs";
const MAX_PAGES = 100;
const STATUS_BATCH = 100;

const pageSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
      jobTitle: z.string(),
      companyName: z.string(),
      jobIndustry: z.union([z.array(z.string()), z.string()]).nullish(),
      // "Anywhere", "EMEA", "Bulgaria,  Czechia,  Poland"
      jobGeo: z.string().nullish(),
      jobDescription: z.string().nullish(),
      pubDate: z.string().nullish(),
    }),
  ),
  nextCursor: z.string().nullish(),
  hasMore: z.boolean().nullish(),
});

const statusSchema = z.object({
  jobs: z.array(z.object({ id: z.number(), status: z.enum(["active", "closed", "unknown"]) })),
});

export const jobicy: BoardAdapter = {
  name: "jobicy",

  async fetchJobs() {
    const jobs: BoardJob[] = [];
    let cursor: string | null = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query = new URLSearchParams({ count: "200" });
      // Passed back unchanged; it expires after 24 hours, far longer than one run.
      if (cursor) query.set("cursor", cursor);
      const res = await getJson(`${API}?${query}`, { intervalMs: SITE_INTERVAL_MS, retries: 2 });
      expectOk(res.status, `jobicy page ${page}`);
      const data = pageSchema.parse(res.data);
      for (const job of data.jobs) {
        const industry = Array.isArray(job.jobIndustry) ? job.jobIndustry[0] : job.jobIndustry;
        jobs.push({
          externalId: String(job.id),
          // Titles come HTML-escaped ("R&amp;D").
          title: htmlToText(job.jobTitle) ?? cleanText(job.jobTitle),
          companyName: htmlToText(job.companyName) ?? cleanText(job.companyName),
          url: job.url,
          location: job.jobGeo ?? null,
          remote: true,
          department: industry ? (htmlToText(industry) ?? industry) : null,
          postedAt: job.pubDate ?? null,
          description: htmlToText(job.jobDescription),
        });
      }
      cursor = data.nextCursor ?? null;
      if (!data.hasMore || !cursor) return jobs;
    }
    throw new Error(`jobicy: still more pages after ${MAX_PAGES}`);
  },

  // Free, and also covers jobs older than the feed's 7 days.
  async checkStatus(externalIds) {
    const result = new Map<string, BoardJobStatus>();
    for (let start = 0; start < externalIds.length; start += STATUS_BATCH) {
      const ids = externalIds.slice(start, start + STATUS_BATCH).join(",");
      const res = await getJson(`${API}/status?ids=${ids}`, { intervalMs: SITE_INTERVAL_MS, retries: 2 });
      expectOk(res.status, "jobicy status");
      for (const job of statusSchema.parse(res.data).jobs) result.set(String(job.id), job.status);
    }
    return result;
  },
};
