import * as cheerio from "cheerio";
import { z } from "zod";
import { API_INTERVAL_MS, crawlPolicy, getJson, request } from "../http";
import { cleanText, shortHash } from "../text";
import type { RawJob } from "../types";
import { expectOk, type AtsAdapter } from "./adapter";

// Two kinds of slug: the companyId of a JavaScript widget embedded in the company's own site
// (HTEC, RT-RK), or the subdomain of a career site TalentLyft hosts (teletrader.talentlyft.com).
const COMPANY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PER_PAGE = 200;
const MAX_PAGES = 20;

// The widget's own call (widget.talentlyft.com).
const adsSchema = z.object({
  // Links to other pages; Next is null on the last one.
  Pages: z.object({ Next: z.string().nullish() }).nullish(),
  Results: z.array(
    z.object({
      Id: z.number(),
      Title: z.string(),
      Department: z.object({ Name: z.string().nullish() }).nullish(),
      Location: z
        .object({
          City: z.string().nullish(),
          Country: z.string().nullish(),
          CountryCode: z.string().nullish(),
          // "Remote", "Hybrid", "OnSite"
          WorkLocationType: z.string().nullish(),
          // "Warszawa, Poland (Remote)"
          CityCountry: z.string().nullish(),
        })
        .nullish(),
      AbsoluteUrl: z.string().nullish(),
    }),
  ),
});

async function fetchWidgetJobs(companyId: string): Promise<RawJob[]> {
  const jobs: RawJob[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({
      companyId,
      languageCode: "en",
      sort: "published_date",
      page: String(page),
      perPage: String(PER_PAGE),
      status: "Published",
    });
    const res = await getJson(`https://api.talentlyft.com/public/convert/job_ads?${query}`);
    expectOk(res.status, `talentlyft ${companyId}`);
    const data = adsSchema.parse(res.data);
    for (const ad of data.Results) {
      const location = ad.Location;
      jobs.push({
        externalId: String(ad.Id),
        title: cleanText(ad.Title),
        url: ad.AbsoluteUrl ?? null,
        location: location?.CityCountry ?? ([location?.City, location?.Country].filter(Boolean).join(", ") || null),
        countryCode: location?.CountryCode?.toLowerCase() ?? null,
        remote: location?.WorkLocationType ? location.WorkLocationType === "Remote" : null,
        department: ad.Department?.Name ?? null,
        postedAt: null,
        // Job pages carry JSON-LD, which the `descriptions` stage reads.
        description: null,
      });
    }
    if (!data.Pages?.Next) return jobs;
  }
  return jobs;
}

// A hosted site renders its list from this HTML fragment, which answers only XHR-style requests.
async function fetchHostedJobs(subdomain: string): Promise<RawJob[]> {
  const origin = `https://${subdomain}.talentlyft.com`;
  // Unlike the widget's API, this is the company's career site itself, walked page by page.
  const policy = await crawlPolicy(origin);
  if (!policy.allowed) throw new Error(`talentlyft ${subdomain}: ${policy.error}`);
  const jobs = new Map<string, RawJob>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({
      layoutId: "Jobs-1",
      websiteUrl: origin,
      themeId: "2",
      language: "en",
      subdomain,
      page: String(page),
      pageSize: String(PER_PAGE),
      contains: "",
    });
    const res = await request(`${origin}/JobList?${query}`, {
      headers: { "x-requested-with": "XMLHttpRequest" },
      intervalMs: API_INTERVAL_MS,
    });
    expectOk(res.status, `talentlyft ${subdomain}`);
    const $ = cheerio.load(res.text);
    if ($(".error-page").length) throw new Error(`talentlyft ${subdomain}: error page`);
    const before = jobs.size;
    $("a[href*='/jobs/']").each((_, element) => {
      const link = $(element);
      const href = link.attr("href");
      if (!href) return;
      const url = new URL(href, origin).href;
      // "C++ Developer" / "Beograd, Serbia (Hybrid)"
      const title = cleanText(link.find("h1, h2, h3, h4, h5, h6").first().text() || link.text());
      const location = cleanText(link.find("p").first().text()) || null;
      if (!title) return;
      jobs.set(url, {
        externalId: link.attr("data-job-id") ?? shortHash(url),
        title,
        url,
        location,
        countryCode: null,
        remote: location && /\(remote\)/i.test(location) ? true : null,
        department: null,
        postedAt: null,
        description: null,
      });
    });
    if (jobs.size - before < PER_PAGE) break;
  }
  return [...jobs.values()];
}

export const talentlyft: AtsAdapter = {
  name: "talentlyft",
  boardUrl: (slug) => (COMPANY_ID.test(slug) ? "https://widget.talentlyft.com" : `https://${slug}.talentlyft.com/`),

  fetchJobs(slug) {
    return COMPANY_ID.test(slug) ? fetchWidgetJobs(slug) : fetchHostedJobs(slug);
  },
};
