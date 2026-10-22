import { z } from "zod";
import { htmlToText } from "../extract/description";
import { getJson } from "../http";
import { cleanText } from "../text";
import { expectOk, joinLocations, pickCountry, type AtsAdapter } from "./adapter";

const API = "https://apply.workable.com/api/v1/widget/accounts";

const accountSchema = z.object({
  name: z.string().nullish(),
  jobs: z.array(
    z.object({
      shortcode: z.string(),
      title: z.string(),
      url: z.string().nullish(),
      application_url: z.string().nullish(),
      country: z.string().nullish(),
      city: z.string().nullish(),
      state: z.string().nullish(),
      telecommuting: z.boolean().nullish(),
      department: z.string().nullish(),
      published_on: z.string().nullish(),
      description: z.string().nullish(),
      locations: z
        .array(
          z.object({
            country: z.string().nullish(),
            countryCode: z.string().nullish(),
            city: z.string().nullish(),
          }),
        )
        .nullish(),
    }),
  ),
});

async function getAccount(slug: string) {
  const res = await getJson(`${API}/${encodeURIComponent(slug)}`);
  return { status: res.status, account: accountSchema.safeParse(res.data) };
}

export const workable: AtsAdapter = {
  name: "workable",
  boardUrl: (slug) => `https://apply.workable.com/${slug}/`,

  async probe(slug) {
    const { status, account } = await getAccount(slug);
    if (status !== 200 || !account.success) return null;
    return {
      name: account.data.name ?? null,
      sampleText: "",
      jobCount: account.data.jobs.length,
    };
  },

  async fetchJobs(slug) {
    const { status, account } = await getAccount(slug);
    expectOk(status, `workable ${slug}`);
    if (!account.success) throw account.error;
    return account.data.jobs.map((job) => {
      const locations = job.locations ?? [];
      return {
        externalId: job.shortcode,
        title: cleanText(job.title),
        url: job.url ?? job.application_url ?? null,
        location: locations.length
          ? joinLocations(locations.map((l) => [l.city, l.country].filter(Boolean).join(", ")))
          : joinLocations([[job.city, job.state, job.country].filter(Boolean).join(", ")]),
        countryCode: pickCountry(locations.map((l) => l.countryCode)),
        remote: job.telecommuting ?? null,
        department: job.department || null,
        postedAt: job.published_on ?? null,
        description: htmlToText(job.description),
      };
    });
  },
};
