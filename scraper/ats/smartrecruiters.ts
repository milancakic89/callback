import { z } from "zod";
import { htmlToText } from "../extract/description";
import { getJson } from "../http";
import { cleanText } from "../text";
import { expectOk, type AtsAdapter } from "./adapter";

const API = "https://api.smartrecruiters.com/v1/companies";
const PAGE_SIZE = 100;

const postingsSchema = z.object({
  totalFound: z.number(),
  content: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      releasedDate: z.string().nullish(),
      company: z.object({ identifier: z.string(), name: z.string().nullish() }),
      department: z.object({ label: z.string().nullish() }).nullish(),
      location: z
        .object({
          fullLocation: z.string().nullish(),
          city: z.string().nullish(),
          country: z.string().nullish(),
          remote: z.boolean().nullish(),
        })
        .nullish(),
    }),
  ),
});

// The list endpoint omits the job ad; the detail endpoint nests it in named HTML sections.
const postingDetailSchema = z.object({
  jobAd: z.object({
    sections: z
      .object({
        jobDescription: z.object({ text: z.string().nullish() }).nullish(),
        qualifications: z.object({ text: z.string().nullish() }).nullish(),
        additionalInformation: z.object({ text: z.string().nullish() }).nullish(),
      })
      .nullish(),
  }),
});

const DETAIL_URL = /jobs\.smartrecruiters\.com\/([^/]+)\/(\d+)/;

export const smartrecruiters: AtsAdapter = {
  name: "smartrecruiters",
  boardUrl: (slug) => `https://careers.smartrecruiters.com/${slug}`,

  async probe(slug) {
    const res = await getJson(`${API}/${encodeURIComponent(slug)}/postings?limit=1`);
    const postings = postingsSchema.safeParse(res.data);
    if (res.status !== 200 || !postings.success) return null;
    return {
      name: postings.data.content[0]?.company.name ?? null,
      sampleText: "",
      jobCount: postings.data.totalFound,
    };
  },

  // Asks for Serbian postings only; remote postings are always tied to some country here.
  async fetchJobs(slug) {
    const jobs = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const res = await getJson(
        `${API}/${encodeURIComponent(slug)}/postings?country=rs&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      expectOk(res.status, `smartrecruiters ${slug}`);
      const page = postingsSchema.parse(res.data);
      for (const posting of page.content) {
        jobs.push({
          externalId: posting.id,
          title: cleanText(posting.name),
          url: `https://jobs.smartrecruiters.com/${posting.company.identifier}/${posting.id}`,
          location: posting.location?.fullLocation ?? posting.location?.city ?? null,
          countryCode: posting.location?.country?.toLowerCase() ?? null,
          remote: posting.location?.remote ?? null,
          department: posting.department?.label ?? null,
          postedAt: posting.releasedDate ?? null,
          description: null,
        });
      }
      if (page.content.length < PAGE_SIZE || offset + PAGE_SIZE >= page.totalFound) return jobs;
    }
  },

  async fetchDescription(job) {
    // The API needs the company identifier, only available by parsing the job's own URL.
    const match = job.url ? DETAIL_URL.exec(job.url) : null;
    if (!match) return null;
    const [, company, id] = match;
    const res = await getJson(`${API}/${encodeURIComponent(company)}/postings/${id}`);
    if (res.status !== 200) return null;
    const detail = postingDetailSchema.safeParse(res.data);
    if (!detail.success) return null;
    const sections = detail.data.jobAd.sections;
    const text = [sections?.jobDescription?.text, sections?.qualifications?.text, sections?.additionalInformation?.text]
      .map((section) => htmlToText(section))
      .filter((section): section is string => section !== null)
      .join("\n\n");
    return text || null;
  },
};
