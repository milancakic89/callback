import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson } from "../http";
import { cleanText } from "../text";
import type { BoardAdapter } from "./board";

// One call returns the whole (free, 24-hour delayed) feed. Remotive asks for at most 4 calls a day
// and blocks more than 2 a minute.
const API = "https://remotive.com/api/remote-jobs";

const feedSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
      title: z.string(),
      company_name: z.string(),
      category: z.string().nullish(),
      publication_date: z.string().nullish(),
      // "Worldwide", "Europe, USA, Canada, APAC"
      candidate_required_location: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
});

export const remotive: BoardAdapter = {
  name: "remotive",

  async fetchJobs() {
    const res = await getJson(API, { retries: 0 });
    expectOk(res.status, "remotive");
    return feedSchema.parse(res.data).jobs.map((job) => ({
      externalId: String(job.id),
      title: cleanText(job.title),
      companyName: cleanText(job.company_name),
      url: job.url,
      location: job.candidate_required_location ?? null,
      remote: true,
      department: job.category ?? null,
      postedAt: job.publication_date ?? null,
      description: htmlToText(job.description),
    }));
  },
};
