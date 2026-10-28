import { isRobotsDisallowed } from "../http";
import { placeJob } from "../normalize";
import { readData, writeData } from "../store";
import { plain } from "../text";
import {
  careersFileSchema,
  companiesFileSchema,
  jobertyJobsFileSchema,
  jobsFileSchema,
  scrapesFileSchema,
  type Job,
  type RawJob,
} from "../types";

function countBy<T>(items: T[], key: (item: T) => string | null): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
}

// Stage 4: filter to Serbia + remote, merge sources, keep history, write report and review list.
export async function runFinalize(): Promise<void> {
  const companies = await readData("companies.json", companiesFileSchema, []);
  const careers = await readData("careers.json", careersFileSchema, {});
  const scrapes = await readData("jobs-raw.json", scrapesFileSchema, {});
  const joberty = await readData("joberty-jobs.json", jobertyJobsFileSchema, { fetchedAt: null, jobs: [] });
  const previous = await readData("jobs.json", jobsFileSchema, []);

  const companyById = new Map(companies.map((company) => [company.jobertyId, company]));
  // The `descriptions` stage backfills the description and the posting date after finalize runs, and
  // marks the job as checked; a plain re-scrape must not erase any of that.
  const previousById = new Map(previous.map((job) => [job.id, job]));
  const jobs = new Map<string, Job>();
  let seen = 0;
  let dropped = 0;

  function add(raw: RawJob, companyId: number, fallbackName: string, source: string, seenAt: string) {
    seen++;
    const company = companyById.get(companyId);
    const placement = placeJob(raw, company?.offices ?? []);
    if (!placement.keep) {
      dropped++;
      return;
    }
    const id = `${source}:${raw.externalId}`;
    // Two Joberty companies can share one ATS board; the first keeps the job.
    if (jobs.has(id)) return;
    jobs.set(id, {
      id,
      companyJobertyId: companyId,
      companyName: company?.name ?? fallbackName,
      title: raw.title,
      locationRaw: raw.location,
      country: placement.country,
      isRemote: placement.isRemote,
      remoteScope: placement.remoteScope,
      department: raw.department,
      url: raw.url,
      description: raw.description ?? previousById.get(id)?.description ?? null,
      source,
      // What the source's own list says wins; else a date a job page gave earlier.
      postedAt: raw.postedAt ?? previousById.get(id)?.postedAt ?? null,
      detailsCheckedAt: previousById.get(id)?.detailsCheckedAt ?? null,
      firstSeenAt: previousById.get(id)?.firstSeenAt ?? seenAt,
      lastSeenAt: seenAt,
      active: true,
    });
  }

  for (const [companyId, scrape] of Object.entries(scrapes)) {
    if (scrape.status !== "ok" || !scrape.source) continue;
    for (const raw of scrape.jobs) add(raw, Number(companyId), "", scrape.source, scrape.scrapedAt);
  }

  // Joberty postings, unless the company's own source already lists the same title.
  const ownTitles = new Set([...jobs.values()].map((job) => `${job.companyJobertyId}:${plain(job.title)}`));
  for (const raw of joberty.jobs) {
    if (ownTitles.has(`${raw.companyJobertyId}:${plain(raw.title)}`)) continue;
    add(raw, raw.companyJobertyId, raw.companyName, "joberty", joberty.fetchedAt ?? new Date().toISOString());
  }

  // A job missing from a successful scrape is closed; after a failed scrape it stays as it was.
  // The exception is a company whose robots.txt forbids us (http.ts): nothing is read from its pages
  // any more, so what was read earlier is closed too. Joberty's own list is a public API, unaffected.
  for (const old of previous) {
    if (jobs.has(old.id)) continue;
    const scrape = scrapes[old.companyJobertyId];
    const refreshed =
      old.source === "joberty"
        ? joberty.fetchedAt !== null
        : scrape?.status === "ok" || isRobotsDisallowed(scrape?.error);
    jobs.set(old.id, refreshed ? { ...old, active: false } : old);
  }

  const list = [...jobs.values()].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      a.companyName.localeCompare(b.companyName) ||
      a.title.localeCompare(b.title),
  );
  await writeData("jobs.json", list, jobsFileSchema);

  const active = list.filter((job) => job.active);
  const careerResults = Object.values(careers);
  const scrapeResults = Object.values(scrapes);
  const report = {
    generatedAt: new Date().toISOString(),
    companies: {
      total: companies.length,
      withWebsite: companies.filter((company) => company.website).length,
    },
    careers: {
      checked: careerResults.length,
      byStatus: countBy(careerResults, (r) => r.status),
      byVia: countBy(careerResults, (r) => r.via),
      byAts: countBy(careerResults, (r) => r.ats),
    },
    scrapes: {
      total: scrapeResults.length,
      byStatus: countBy(scrapeResults, (s) => s.status),
      bySource: countBy(scrapeResults, (s) => s.source),
      companiesWithJobs: new Set(active.map((job) => job.companyJobertyId)).size,
    },
    jobs: {
      active: active.length,
      inactive: list.length - active.length,
      inSerbia: active.filter((job) => job.country === "RS").length,
      remoteOnly: active.filter((job) => job.isRemote && job.country === null).length,
      unknownLocation: active.filter((job) => !job.isRemote && job.country === null).length,
      withDescription: active.filter((job) => job.description !== null).length,
      bySource: countBy(active, (job) => job.source),
      seenBeforeFilter: seen,
      droppedByLocation: dropped,
    },
    topCompanies: Object.entries(countBy(active, (job) => job.companyName))
      .slice(0, 20)
      .map(([name, count]) => ({ name, jobs: count })),
  };
  await writeData("report.json", report);

  const review = companies
    .map((company) => {
      const career = careers[company.jobertyId];
      const scrape = scrapes[company.jobertyId];
      if (!career) return null;
      let reason: string | null = null;
      if (career.status === "not_found" || career.status === "error") reason = `careers_${career.status}`;
      else if (scrape && scrape.status !== "ok") reason = `jobs_${scrape.status}`;
      else if (career.status === "ambiguous" && !scrape) reason = "careers_ambiguous";
      if (!reason) return null;
      return {
        jobertyId: company.jobertyId,
        name: company.name,
        employees: company.employees,
        reviewCount: company.reviewCount,
        reason,
        website: company.website,
        careersUrl: career.careersUrl,
        error: scrape?.error ?? career.error,
        candidates: career.candidates.length ? career.candidates : undefined,
        jobertyUrl: `https://www.joberty.com/it-company/${company.jobertyId}/${company.slug}/overview`,
      };
    })
    .filter((entry) => entry !== null)
    // Most-reviewed companies first: usually the bigger employers.
    .sort((a, b) => b.reviewCount - a.reviewCount);
  await writeData("needs-review.json", review);

  console.log(
    `[finalize] ${active.length} active jobs (${report.jobs.inSerbia} in Serbia, ${report.jobs.remoteOnly} remote, ` +
      `${report.jobs.unknownLocation} unknown location) from ${report.scrapes.companiesWithJobs} companies; ` +
      `${review.length} companies need review`,
  );
}
