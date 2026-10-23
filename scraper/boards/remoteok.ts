import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson, SITE_INTERVAL_MS } from "../http";
import { cleanText } from "../text";
import type { BoardAdapter, BoardJob } from "./board";

// Each call is a fixed window of the ~100 newest postings: no search, no paging. A tag gives its
// own newest 100, so the main feed plus these reached 439 distinct jobs instead of 99 (2026-10-24).
const API = "https://remoteok.com/api";
const TAGS = ["dev", "devops", "product", "design", "engineer", "sales", "marketing", "finance", "non-tech", "customer-support", "exec"];

const jobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  position: z.string(),
  company: z.string(),
  // Empty for about half the postings; remoteok.com shows those as "🌏 Worldwide".
  location: z.string().nullish(),
  description: z.string().nullish(),
  date: z.string().nullish(),
  url: z.string(),
});

export const remoteok: BoardAdapter = {
  name: "remoteok",

  async fetchJobs() {
    const jobs = new Map<string, BoardJob>();
    for (const url of [API, ...TAGS.map((tag) => `${API}?tag=${tag}`)]) {
      const res = await getJson(url, { intervalMs: SITE_INTERVAL_MS * 1.5, retries: 2 });
      expectOk(res.status, `remoteok ${url}`);
      // The first element is the legal notice and timestamp, not a job.
      for (const item of z.array(z.unknown()).parse(res.data)) {
        const job = jobSchema.safeParse(item);
        if (!job.success) continue;
        jobs.set(String(job.data.id), {
          externalId: String(job.data.id),
          title: htmlToText(job.data.position) ?? cleanText(job.data.position),
          companyName: htmlToText(job.data.company) ?? cleanText(job.data.company),
          url: job.data.url,
          location: cleanText(job.data.location) || "Worldwide",
          remote: true,
          department: null,
          postedAt: job.data.date ?? null,
          description: htmlToText(job.data.description),
        });
      }
    }
    return [...jobs.values()];
  },
};
