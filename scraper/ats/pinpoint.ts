import { z } from "zod";
import { htmlToText } from "../extract/description";
import { asRecord, asString, firstString } from "../extract/json";
import { getJson } from "../http";
import { cleanText } from "../text";
import { expectOk, joinLocations, type AtsAdapter } from "./adapter";

// Field names beyond id/title vary between accounts, so the rest is read loosely.
const postingsSchema = z.object({
  data: z.array(
    z.object({ id: z.union([z.string(), z.number()]), title: z.string() }).catchall(z.unknown()),
  ),
});

export const pinpoint: AtsAdapter = {
  name: "pinpoint",
  boardUrl: (slug) => `https://${slug}.pinpointhq.com/`,

  async fetchJobs(slug) {
    const res = await getJson(`https://${slug}.pinpointhq.com/postings.json`);
    expectOk(res.status, `pinpoint ${slug}`);
    return postingsSchema.parse(res.data).data.map((posting) => {
      const location = asRecord(posting.location);
      const workplace = asString(posting.workplace_type);
      return {
        externalId: String(posting.id),
        title: cleanText(posting.title),
        url: asString(posting.url),
        location: location
          ? joinLocations([[firstString(location, ["city", "name"]), asString(location.province)].filter(Boolean).join(", ")])
          : asString(posting.location),
        countryCode: null,
        remote: workplace ? workplace.toLowerCase() === "remote" : null,
        department: asString(asRecord(asRecord(posting.job)?.department)?.name),
        postedAt: null,
        // Field name isn't documented publicly; try the common ones defensively.
        description: htmlToText(firstString(posting, ["description", "content", "summary"])),
      };
    });
  },
};
