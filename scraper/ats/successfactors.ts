import * as cheerio from "cheerio";
import { htmlToText } from "../extract/description";
import { fetchHtml } from "../http";
import { cleanText, shortHash } from "../text";
import type { RawJob } from "../types";
import type { AtsAdapter } from "./adapter";

// SAP SuccessFactors career sites ("RMK": jobs.zf.com, jobs.atos.net, careers.msg-global.com).
// The slug is the site's host. Their search filters by country server-side, like Workday's
// searchText; a global employer's full list would be thousands of jobs.
const PAGE_SIZE = 25;
const MAX_PAGES = 40;

export const successfactors: AtsAdapter = {
  name: "successfactors",
  boardUrl: (host) => `https://${host}/search/?q=&locationsearch=Serbia`,

  async fetchJobs(host) {
    const jobs = new Map<string, RawJob>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `https://${host}/search/?q=&locationsearch=Serbia&startrow=${page * PAGE_SIZE}`;
      const res = await fetchHtml(url);
      if (!res.usable) throw new Error(`successfactors ${host}: ${res.error}`);
      const $ = cheerio.load(res.html);
      const rows = $("tr.data-row");
      rows.each((_, element) => {
        const row = $(element);
        const link = row.find("a.jobTitle-link").first();
        const href = link.attr("href");
        if (!href) return;
        const jobUrl = new URL(href, `https://${host}`).href;
        // "Belgrad, 00, RS"
        const location = cleanText(row.find(".jobLocation").first().text()) || null;
        const date = Date.parse(cleanText(row.find(".jobDate").first().text()));
        jobs.set(jobUrl, {
          externalId: /\/(\d+)\/?$/.exec(jobUrl)?.[1] ?? shortHash(jobUrl),
          title: cleanText(link.text()),
          url: jobUrl,
          location,
          countryCode: location && /,\s*([A-Z]{2})$/.exec(location)?.[1].toLowerCase() || null,
          remote: null,
          department: cleanText(row.find(".jobDepartment, .jobFacility").first().text()) || null,
          postedAt: Number.isNaN(date) ? null : new Date(date).toISOString(),
          description: null,
        });
      });
      // "Results 1 – 25 of 29"
      const total = Number(/of\s*(\d+)/.exec(cleanText($(".paginationLabel").first().text()))?.[1] ?? 0);
      if (rows.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= total) break;
    }
    return [...jobs.values()];
  },

  async fetchDescription({ url }) {
    if (!url) return null;
    const res = await fetchHtml(url);
    if (!res.usable) return null;
    const html = cheerio.load(res.html)("[itemprop=description], .jobdescription").first().html();
    return htmlToText(html);
  },
};
