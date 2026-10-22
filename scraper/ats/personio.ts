import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { htmlToText } from "../extract/description";
import { API_INTERVAL_MS, request } from "../http";
import { cleanText } from "../text";
import { expectOk, joinLocations, type AtsAdapter } from "./adapter";

// jobDescriptions is a list of named sections ("Overview", "Qualifications"...), each CDATA HTML.
function sectionsToText($: cheerio.CheerioAPI, position: cheerio.Cheerio<AnyNode>): string | null {
  const parts = position
    .find("jobDescriptions > jobDescription")
    .toArray()
    .map((section) => {
      const el = $(section);
      const heading = cleanText(el.children("name").text());
      const body = htmlToText(el.children("value").text());
      return body ? (heading ? `${heading}\n${body}` : body) : null;
    })
    .filter((part): part is string => part !== null);
  return parts.length ? parts.join("\n\n") : null;
}

export const personio: AtsAdapter = {
  name: "personio",
  boardUrl: (slug) => `https://${slug}.jobs.personio.de/`,

  async fetchJobs(slug) {
    const res = await request(`https://${slug}.jobs.personio.de/xml?language=en`, {
      intervalMs: API_INTERVAL_MS,
    });
    expectOk(res.status, `personio ${slug}`);
    const $ = cheerio.load(res.text, { xml: true });
    return $("position")
      .toArray()
      .map((element) => {
        const position = $(element);
        const id = cleanText(position.children("id").text());
        return {
          externalId: id,
          title: cleanText(position.children("name").text()),
          url: `https://${slug}.jobs.personio.de/job/${id}`,
          location: joinLocations([
            position.children("office").text(),
            ...position
              .find("additionalOffices office")
              .toArray()
              .map((office) => $(office).text()),
          ]),
          countryCode: null,
          remote: null,
          department: cleanText(position.children("department").text()) || null,
          postedAt: cleanText(position.children("createdAt").text()) || null,
          description: sectionsToText($, position),
        };
      })
      .filter((job) => job.externalId && job.title);
  },
};
