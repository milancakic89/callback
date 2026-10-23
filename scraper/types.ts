import { z } from "zod";

export const ATS_NAMES = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
  "breezy",
  "personio",
  "workday",
  "pinpoint",
  "teamtailor",
  "talentlyft",
  "bamboohr",
  "jobvite",
  "icims",
  "successfactors",
  "comeet",
  "hibob",
  "jazzhr",
  "join",
] as const;
export const atsNameSchema = z.enum(ATS_NAMES);
export type AtsName = z.infer<typeof atsNameSchema>;

export const companySchema = z.object({
  jobertyId: z.number().int(),
  name: z.string(),
  slug: z.string(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  employees: z.string().nullable(),
  offices: z.array(z.string()),
  reviewCount: z.number(),
  jobertyJobCount: z.number(),
  fetchedAt: z.string(),
});
export type Company = z.infer<typeof companySchema>;
export const companiesFileSchema = z.array(companySchema);

// A posting as a source returns it, before location filtering.
export const rawJobSchema = z.object({
  externalId: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  location: z.string().nullable(),
  // ISO 3166-1 alpha-2, lowercase.
  countryCode: z.string().nullable(),
  remote: z.boolean().nullable(),
  department: z.string().nullable(),
  postedAt: z.string().nullable(),
  // Plain text, HTML stripped. Free from the same call for most ATSs; null until the
  // `descriptions` stage backfills it for the rest. Defaulted so files written before this
  // field existed still parse.
  description: z.string().nullable().default(null),
});
export type RawJob = z.infer<typeof rawJobSchema>;

export const jobertyJobsFileSchema = z.object({
  fetchedAt: z.string().nullable(),
  jobs: z.array(
    rawJobSchema.extend({ companyJobertyId: z.number().int(), companyName: z.string() }),
  ),
});
export type JobertyJobsFile = z.infer<typeof jobertyJobsFileSchema>;

export const careersResultSchema = z.object({
  status: z.enum(["found", "ambiguous", "not_found", "error"]),
  careersUrl: z.string().nullable(),
  via: z.enum(["website", "slug_guess", "static", "browser", "path", "sitemap"]).nullable(),
  ats: atsNameSchema.nullable(),
  atsSlug: z.string().nullable(),
  confidence: z.number(),
  candidates: z.array(z.object({ url: z.string(), text: z.string(), score: z.number() })),
  error: z.string().nullable(),
  checkedAt: z.string(),
});
export type CareersResult = z.infer<typeof careersResultSchema>;
export const careersFileSchema = z.record(z.string(), careersResultSchema);

export const companyScrapeSchema = z.object({
  status: z.enum(["ok", "needs_manual", "error"]),
  // ATS name, "network", "jsonld" or "dom".
  source: z.string().nullable(),
  ats: atsNameSchema.nullable(),
  atsSlug: z.string().nullable(),
  pageUrl: z.string().nullable(),
  jobs: z.array(rawJobSchema),
  error: z.string().nullable(),
  scrapedAt: z.string(),
});
export type CompanyScrape = z.infer<typeof companyScrapeSchema>;
export const scrapesFileSchema = z.record(z.string(), companyScrapeSchema);

// company-boards.json: an ATS board found for a company seen on the job boards (stages/discover.ts),
// keyed by coreName(company). The boards stage reads every found board (boards/companyboards.ts).
export const companyBoardSchema = z.object({
  name: z.string(),
  // Null when none of the guessed slugs led to a board that's provably this company's.
  ats: atsNameSchema.nullable(),
  slug: z.string().nullable(),
  // "name": the ATS reports exactly this company name. "title": the board lists a posting with the
  // same title as one of this company's job-board postings.
  via: z.enum(["name", "title"]).nullable(),
  checkedAt: z.string(),
});
export type CompanyBoard = z.infer<typeof companyBoardSchema>;
export const companyBoardsFileSchema = z.record(z.string(), companyBoardSchema);

export const jobSchema = z.object({
  id: z.string(),
  companyJobertyId: z.number().int(),
  companyName: z.string(),
  title: z.string(),
  locationRaw: z.string().nullable(),
  country: z.literal("RS").nullable(),
  isRemote: z.boolean(),
  remoteScope: z.string().nullable(),
  department: z.string().nullable(),
  url: z.string().nullable(),
  description: z.string().nullable().default(null),
  source: z.string(),
  postedAt: z.string().nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  active: z.boolean(),
});
export type Job = z.infer<typeof jobSchema>;
export const jobsFileSchema = z.array(jobSchema);
