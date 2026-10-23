import { z } from "zod";
import { getJson } from "../http";
import { cleanText } from "../text";
import { expectOk, joinLocations, type AtsAdapter } from "./adapter";

const postingsSchema = z.array(
  z.object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string().nullish(),
    country: z.string().nullish(),
    workplaceType: z.string().nullish(),
    createdAt: z.number().nullish(),
    descriptionPlain: z.string().nullish(),
    categories: z
      .object({
        location: z.string().nullish(),
        allLocations: z.array(z.string()).nullish(),
        team: z.string().nullish(),
        department: z.string().nullish(),
      })
      .nullish(),
  }),
);

// EU-hosted accounts live on a separate API host. Big boards are slow: TSMG's ~4,500 postings are
// 34 MB and take about a minute, so allow well over that.
async function getPostings(slug: string, query: string) {
  const path = `/v0/postings/${encodeURIComponent(slug)}?mode=json${query}`;
  const options = { timeoutMs: 120_000 };
  const res = await getJson(`https://api.lever.co${path}`, options);
  return res.status === 404 ? getJson(`https://api.eu.lever.co${path}`, options) : res;
}

export const lever: AtsAdapter = {
  name: "lever",
  boardUrl: (slug) => `https://jobs.lever.co/${slug}`,

  async probe(slug) {
    const res = await getJson(
      `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json&limit=3`,
    );
    const postings = postingsSchema.safeParse(res.data);
    if (res.status !== 200 || !postings.success) return null;
    return {
      name: null,
      sampleText: postings.data.map((p) => p.descriptionPlain ?? "").join(" "),
      jobCount: null,
    };
  },

  async fetchJobs(slug) {
    const res = await getPostings(slug, "");
    expectOk(res.status, `lever ${slug}`);
    return postingsSchema.parse(res.data).map((posting) => ({
      externalId: posting.id,
      title: cleanText(posting.text),
      url: posting.hostedUrl ?? null,
      location: joinLocations([
        ...(posting.categories?.allLocations ?? []),
        posting.categories?.location,
      ]),
      countryCode: posting.country?.toLowerCase() ?? null,
      remote: posting.workplaceType ? posting.workplaceType === "remote" : null,
      department: posting.categories?.team ?? posting.categories?.department ?? null,
      postedAt: posting.createdAt ? new Date(posting.createdAt).toISOString() : null,
      description: posting.descriptionPlain?.trim() || null,
    }));
  },
};
