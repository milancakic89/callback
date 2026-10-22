import { z } from "zod";
import { extractJsonLdDescription } from "../extract/description";
import { fetchHtml, getJson } from "../http";
import { cleanText, sameSite } from "../text";
import { expectOk, joinLocations, pickCountry, type AtsAdapter } from "./adapter";

const locationSchema = z.object({
  name: z.string().nullish(),
  country: z.object({ id: z.string().nullish(), name: z.string().nullish() }).nullish(),
  is_remote: z.boolean().nullish(),
  remote_details: z.object({ value: z.string().nullish() }).nullish(),
});

const positionsSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    url: z.string().nullish(),
    published_date: z.string().nullish(),
    department: z.string().nullish(),
    company: z.object({ name: z.string().nullish() }).nullish(),
    location: locationSchema.nullish(),
    locations: z.array(locationSchema).nullish(),
  }),
);

async function getPositions(slug: string) {
  const res = await getJson(`https://${slug}.breezy.hr/json`);
  return { status: res.status, positions: positionsSchema.safeParse(res.data) };
}

export const breezy: AtsAdapter = {
  name: "breezy",
  boardUrl: (slug) => `https://${slug}.breezy.hr/`,

  async probe(slug) {
    if (!/^[a-z0-9-]+$/.test(slug)) return null;
    const { status, positions } = await getPositions(slug);
    if (status !== 200 || !positions.success) return null;
    return {
      name: positions.data[0]?.company?.name ?? null,
      sampleText: "",
      jobCount: positions.data.length,
    };
  },

  async fetchJobs(slug) {
    const { status, positions } = await getPositions(slug);
    expectOk(status, `breezy ${slug}`);
    if (!positions.success) throw positions.error;
    return positions.data.map((position) => {
      const locations = position.locations?.length ? position.locations : [position.location];
      const primary = position.location;
      return {
        externalId: position.id,
        title: cleanText(position.name),
        url: position.url ?? null,
        location: joinLocations(
          locations.map((l) => [l?.name, l?.country?.name].filter(Boolean).join(", ")),
        ),
        countryCode: pickCountry(locations.map((l) => l?.country?.id)),
        // is_remote is also true for hybrid roles; remote_details tells them apart.
        remote: primary?.remote_details?.value
          ? primary.remote_details.value === "remote"
          : (primary?.is_remote ?? null),
        department: position.department ?? null,
        postedAt: position.published_date ?? null,
        description: null,
      };
    });
  },

  // The board's own list endpoint has no description; each posting's page carries JSON-LD.
  async fetchDescription(job) {
    if (!job.url || !sameSite(job.url, "https://breezy.hr")) return null;
    const page = await fetchHtml(job.url);
    return page.usable ? extractJsonLdDescription(page.html) : null;
  },
};
