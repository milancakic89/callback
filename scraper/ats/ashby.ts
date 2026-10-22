import { z } from "zod";
import { getJson } from "../http";
import { cleanText } from "../text";
import { expectOk, joinLocations, type AtsAdapter } from "./adapter";

const API = "https://api.ashbyhq.com/posting-api/job-board";

const boardSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      jobUrl: z.string().nullish(),
      location: z.string().nullish(),
      secondaryLocations: z.array(z.object({ location: z.string().nullish() })).nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: z.string().nullish(),
      department: z.string().nullish(),
      publishedAt: z.string().nullish(),
      isListed: z.boolean().nullish(),
      descriptionPlain: z.string().nullish(),
    }),
  ),
});

async function getBoard(slug: string) {
  const res = await getJson(`${API}/${encodeURIComponent(slug)}`);
  return { status: res.status, board: boardSchema.safeParse(res.data) };
}

export const ashby: AtsAdapter = {
  name: "ashby",
  boardUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,

  async probe(slug) {
    const { status, board } = await getBoard(slug);
    if (status !== 200 || !board.success) return null;
    return {
      name: null,
      sampleText: board.data.jobs
        .slice(0, 3)
        .map((job) => job.descriptionPlain ?? "")
        .join(" "),
      jobCount: board.data.jobs.length,
    };
  },

  async fetchJobs(slug) {
    const { status, board } = await getBoard(slug);
    expectOk(status, `ashby ${slug}`);
    if (!board.success) throw board.error;
    return board.data.jobs
      .filter((job) => job.isListed !== false)
      .map((job) => ({
        externalId: job.id,
        title: cleanText(job.title),
        url: job.jobUrl ?? null,
        location: joinLocations([
          job.location,
          ...(job.secondaryLocations ?? []).map((l) => l.location),
        ]),
        countryCode: null,
        remote: job.workplaceType ? job.workplaceType.toLowerCase() === "remote" : (job.isRemote ?? null),
        department: job.department ?? null,
        postedAt: job.publishedAt ?? null,
        description: job.descriptionPlain?.trim() || null,
      }));
  },
};
