import { z } from "zod";
import { htmlToText } from "../extract/description";
import { normalizePostedAt } from "../extract/posted-at";
import { getJson } from "../http";
import { cleanText } from "../text";
import { expectOk, joinLocations, type AtsAdapter } from "./adapter";

const listSchema = z.object({
  result: z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      jobOpeningName: z.string(),
      departmentLabel: z.string().nullish(),
      location: z.object({ city: z.string().nullish(), state: z.string().nullish() }).nullish(),
      atsLocation: z
        .object({ city: z.string().nullish(), state: z.string().nullish(), country: z.string().nullish() })
        .nullish(),
      isRemote: z.boolean().nullish(),
      // "0" on-site, "1" remote, "2" hybrid.
      locationType: z.string().nullish(),
    }),
  ),
});

const detailSchema = z.object({
  result: z.object({
    jobOpening: z.object({ description: z.string().nullish(), datePosted: z.string().nullish() }),
  }),
});

export const bamboohr: AtsAdapter = {
  name: "bamboohr",
  boardUrl: (slug) => `https://${slug}.bamboohr.com/careers`,

  // The list has no description or date; `descriptions` fetches each job's detail (fetchDetails).
  async fetchJobs(slug) {
    const res = await getJson(`https://${slug}.bamboohr.com/careers/list`);
    expectOk(res.status, `bamboohr ${slug}`);
    return listSchema.parse(res.data).result.map((job) => ({
      externalId: String(job.id),
      title: cleanText(job.jobOpeningName),
      url: `https://${slug}.bamboohr.com/careers/${job.id}`,
      location: joinLocations([
        [job.location?.city, job.location?.state].filter(Boolean).join(", "),
        [job.atsLocation?.city, job.atsLocation?.state, job.atsLocation?.country].filter(Boolean).join(", "),
      ]),
      countryCode: null,
      remote: job.isRemote ?? (job.locationType ? job.locationType === "1" : null),
      department: job.departmentLabel ?? null,
      postedAt: null,
      description: null,
    }));
  },

  async fetchDetails({ externalId, url }) {
    const slug = url ? /^https:\/\/([a-z0-9-]+)\.bamboohr\.com\//i.exec(url)?.[1] : null;
    if (!slug) return null;
    const res = await getJson(`https://${slug}.bamboohr.com/careers/${encodeURIComponent(externalId)}/detail`);
    const detail = detailSchema.safeParse(res.data);
    if (res.status !== 200 || !detail.success) return null;
    const opening = detail.data.result.jobOpening;
    return { description: htmlToText(opening.description), postedAt: normalizePostedAt(opening.datePosted) };
  },
};
