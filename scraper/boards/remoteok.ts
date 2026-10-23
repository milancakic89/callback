import { z } from "zod";
import { expectOk } from "../ats/adapter";
import { htmlToText } from "../extract/description";
import { getJson } from "../http";
import { cleanText } from "../text";
import type { BoardAdapter } from "./board";

// A fixed window of the ~100 newest postings: no search, no paging.
const API = "https://remoteok.com/api";

const jobSchema = z.object({
  id: z.union([z.string(), z.number()]),
  position: z.string(),
  company: z.string(),
  // Empty for about half the postings, which RemoteOK leaves unrestricted.
  location: z.string().nullish(),
  description: z.string().nullish(),
  date: z.string().nullish(),
  url: z.string(),
});

export const remoteok: BoardAdapter = {
  name: "remoteok",

  async fetchJobs() {
    const res = await getJson(API, { retries: 2 });
    expectOk(res.status, "remoteok");
    // The first element is the legal notice and timestamp, not a job.
    return z
      .array(z.unknown())
      .parse(res.data)
      .flatMap((item) => {
        const job = jobSchema.safeParse(item);
        if (!job.success) return [];
        return [
          {
            externalId: String(job.data.id),
            title: htmlToText(job.data.position) ?? cleanText(job.data.position),
            companyName: htmlToText(job.data.company) ?? cleanText(job.data.company),
            url: job.data.url,
            location: cleanText(job.data.location) || null,
            remote: true,
            department: null,
            postedAt: job.data.date ?? null,
            description: htmlToText(job.data.description),
          },
        ];
      });
  },
};
