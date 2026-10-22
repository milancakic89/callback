import { z } from "zod";
import { htmlToText } from "../extract/description";
import { getJson } from "../http";
import { cleanText } from "../text";
import { expectOk, type AtsAdapter } from "./adapter";

const API = "https://boards-api.greenhouse.io/v1/boards";

const boardSchema = z.object({ name: z.string().nullish() });

const jobsSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      absolute_url: z.string().nullish(),
      location: z.object({ name: z.string().nullish() }).nullish(),
      first_published: z.string().nullish(),
      updated_at: z.string().nullish(),
      // Only present when the list is fetched with content=true.
      content: z.string().nullish(),
    }),
  ),
});

export const greenhouse: AtsAdapter = {
  name: "greenhouse",
  boardUrl: (slug) => `https://job-boards.greenhouse.io/${slug}`,

  async probe(slug) {
    const res = await getJson(`${API}/${encodeURIComponent(slug)}`);
    const board = boardSchema.safeParse(res.data);
    if (res.status !== 200 || !board.success) return null;
    return { name: board.data.name ?? null, sampleText: "", jobCount: null };
  },

  async fetchJobs(slug) {
    // content=true adds the full job description to each item at no extra request.
    const res = await getJson(`${API}/${encodeURIComponent(slug)}/jobs?content=true`);
    expectOk(res.status, `greenhouse ${slug}`);
    return jobsSchema.parse(res.data).jobs.map((job) => ({
      externalId: String(job.id),
      title: cleanText(job.title),
      url: job.absolute_url ?? null,
      location: job.location?.name ?? null,
      countryCode: null,
      remote: null,
      department: null,
      postedAt: job.first_published ?? job.updated_at ?? null,
      description: htmlToText(job.content),
    }));
  },
};
