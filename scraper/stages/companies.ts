import { z } from "zod";
import { getJson, SITE_INTERVAL_MS } from "../http";
import { writeData } from "../store";
import { cleanText } from "../text";
import {
  companiesFileSchema,
  jobertyJobsFileSchema,
  type Company,
  type JobertyJobsFile,
} from "../types";

const API = "https://backend.joberty.com/api/v1";
// The API answers INVALID_PAGE_SIZE above 24.
const PAGE_SIZE = 24;
const LOCATION = "Serbia";

const jobertyCompanySchema = z.object({
  id: z.number(),
  name: z.string(),
  companyUrlName: z.string(),
  website: z.string().nullish(),
  industry: z.string().nullish(),
  employeeNumber: z.string().nullish(),
  offices: z.array(z.string()).nullish(),
  reviewCount: z.number().nullish(),
  jobCount: z.number().nullish(),
});

const jobertyJobSchema = z.object({
  id: z.number(),
  jobTitle: z.string(),
  companyId: z.number(),
  companyName: z.string(),
  companyUrlName: z.string(),
  cities: z.array(z.string()).nullish(),
  domains: z.array(z.string()).nullish(),
});

async function fetchAllPages<T extends z.ZodType>(
  path: string,
  item: T,
  extraQuery: string,
): Promise<z.output<T>[]> {
  const pageSchema = z.object({ totalPage: z.number(), items: z.array(item) });
  const items: z.output<T>[] = [];
  for (let page = 0, totalPage = 1; page < totalPage; page++) {
    const url = `${API}${path}?page=${page}&pageSize=${PAGE_SIZE}&location=${LOCATION}${extraQuery}`;
    const res = await getJson(url, { intervalMs: SITE_INTERVAL_MS, retries: 2 });
    if (res.status !== 200) throw new Error(`Joberty ${path} page ${page}: HTTP ${res.status}`);
    const data = pageSchema.parse(res.data);
    totalPage = data.totalPage;
    items.push(...data.items);
    process.stdout.write(`\r[companies] ${path} page ${page + 1}/${totalPage}`);
  }
  process.stdout.write("\n");
  return items;
}

// "relio.ch" → "https://relio.ch/", "-" → null
export function normalizeWebsite(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, "");
  if (!value || !value.includes(".")) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

export async function runCompanies(): Promise<void> {
  const fetchedAt = new Date().toISOString();

  const items = await fetchAllPages("/companies/all", jobertyCompanySchema, "&sort=featured");
  const companies = new Map<number, Company>();
  for (const item of items) {
    // Paging through a live list can repeat an item across pages.
    if (companies.has(item.id)) continue;
    companies.set(item.id, {
      jobertyId: item.id,
      name: cleanText(item.name),
      slug: item.companyUrlName,
      website: normalizeWebsite(item.website),
      industry: item.industry || null,
      employees: item.employeeNumber || null,
      offices: item.offices ?? [],
      reviewCount: item.reviewCount ?? 0,
      jobertyJobCount: item.jobCount ?? 0,
      fetchedAt,
    });
  }
  const list = [...companies.values()];
  await writeData("companies.json", list, companiesFileSchema);
  const withWebsite = list.filter((company) => company.website).length;
  console.log(`[companies] ${list.length} companies, ${withWebsite} with a website`);

  const jobs = await fetchAllPages("/jobs", jobertyJobSchema, "");
  const file: JobertyJobsFile = {
    fetchedAt,
    jobs: jobs.map((job) => ({
      externalId: String(job.id),
      title: cleanText(job.jobTitle),
      url: `https://www.joberty.com/it-company/${job.companyId}/${job.companyUrlName}/jobs`,
      location: job.cities?.join(" / ") || null,
      countryCode: null,
      remote: null,
      department: job.domains?.join(", ") || null,
      postedAt: null,
      description: null,
      companyJobertyId: job.companyId,
      companyName: cleanText(job.companyName),
    })),
  };
  await writeData("joberty-jobs.json", file, jobertyJobsFileSchema);
  console.log(`[companies] ${file.jobs.length} jobs posted on Joberty`);
}
