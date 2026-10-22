import { z } from "zod";
import { htmlToText } from "../extract/description";
import { getJson } from "../http";
import { cleanText } from "../text";
import { expectOk, joinLocations, pickCountry, type AtsAdapter } from "./adapter";

const offersSchema = z.object({
  offers: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      description: z.string().nullish(),
      careers_url: z.string().nullish(),
      location: z.string().nullish(),
      country_code: z.string().nullish(),
      remote: z.boolean().nullish(),
      department: z.string().nullish(),
      published_at: z.string().nullish(),
      company_name: z.string().nullish(),
      locations: z
        .array(z.object({ name: z.string().nullish(), country: z.string().nullish(), country_code: z.string().nullish() }))
        .nullish(),
    }),
  ),
});

async function getOffers(slug: string) {
  const res = await getJson(`https://${slug}.recruitee.com/api/offers/`);
  return { status: res.status, offers: offersSchema.safeParse(res.data) };
}

export const recruitee: AtsAdapter = {
  name: "recruitee",
  boardUrl: (slug) => `https://${slug}.recruitee.com/`,

  async probe(slug) {
    if (!/^[a-z0-9-]+$/.test(slug)) return null;
    const { status, offers } = await getOffers(slug);
    if (status !== 200 || !offers.success) return null;
    return {
      name: offers.data.offers[0]?.company_name ?? null,
      sampleText: "",
      jobCount: offers.data.offers.length,
    };
  },

  async fetchJobs(slug) {
    const { status, offers } = await getOffers(slug);
    expectOk(status, `recruitee ${slug}`);
    if (!offers.success) throw offers.error;
    return offers.data.offers.map((offer) => {
      const locations = offer.locations ?? [];
      return {
        externalId: String(offer.id),
        title: cleanText(offer.title),
        url: offer.careers_url ?? null,
        location: joinLocations([
          offer.location,
          ...locations.map((l) => [l.name, l.country].filter(Boolean).join(", ")),
        ]),
        countryCode: pickCountry([offer.country_code, ...locations.map((l) => l.country_code)]),
        remote: offer.remote ?? null,
        department: offer.department ?? null,
        postedAt: offer.published_at ?? null,
        description: htmlToText(offer.description),
      };
    });
  },
};
