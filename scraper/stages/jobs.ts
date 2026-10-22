import { detectAts } from "../ats/detect";
import { getAdapter } from "../ats/registry";
import { isBlocked, withPage } from "../browser";
import { extractDomJobs } from "../extract/dom-heuristic";
import { expandListings, selectSerbia } from "../extract/dropdown";
import { extractInlineJson } from "../extract/inline-json";
import { extractJsonLdJobs } from "../extract/json-ld";
import { findOpeningsLink } from "../extract/links";
import { extractNetworkJobs, type CapturedJson } from "../extract/network-json";
import { fetchHtml, robotsAllowed } from "../http";
import { isSerbianPlace } from "../normalize";
import { logProgress, selectCompanies, type StageOptions } from "../options";
import { forEachLimit } from "../pool";
import { createSaver, readData, writeData } from "../store";
import { describeError } from "../text";
import {
  careersFileSchema,
  companiesFileSchema,
  scrapesFileSchema,
  type AtsName,
  type CareersResult,
  type Company,
  type CompanyScrape,
  type RawJob,
} from "../types";
import { runFinalize } from "./finalize";

// A run within this window counts as done, so an interrupted run resumes instead of starting over.
const RESCRAPE_AFTER_MS = 12 * 60 * 60 * 1000;

type Extracted = {
  source: string;
  ats: AtsName | null;
  atsSlug: string | null;
  jobs: RawJob[];
  pageUrl: string;
};

// Structured sources first: ATS API, the page's own JSON API, JSON-LD, then DOM heuristics.
async function extract(
  html: string,
  pageUrl: string,
  requests: string[],
  captured: CapturedJson[],
): Promise<Extracted | null> {
  const detected = detectAts([pageUrl, html, ...requests]);
  const ats = detected[0] ?? null;
  const adapter = ats ? getAdapter(ats.ats) : null;
  if (ats && adapter) {
    try {
      return { source: ats.ats, ats: ats.ats, atsSlug: ats.slug, jobs: await adapter.fetchJobs(ats.slug), pageUrl };
    } catch {
      // A slug scraped from HTML can be wrong; fall through to the page itself.
    }
  }
  const found = (source: string, jobs: RawJob[]): Extracted | null =>
    jobs.length ? { source, ats: ats?.ats ?? null, atsSlug: ats?.slug ?? null, jobs, pageUrl } : null;
  return (
    found("network", extractNetworkJobs([...captured, ...extractInlineJson(html, pageUrl)], pageUrl)) ??
    found("jsonld", extractJsonLdJobs(html, pageUrl)) ??
    found("dom", extractDomJobs(html, pageUrl))
  );
}

// Most jobs without a location: for a company with offices abroad they can't be placed.
function lacksLocations(found: Extracted): boolean {
  // ATS adapters return locations, or filter by country themselves.
  if (found.source === found.ats) return false;
  const missing = found.jobs.filter((job) => !job.location && !job.countryCode).length;
  return missing > found.jobs.length / 2;
}

async function scrapeStatic(url: string, hops: number): Promise<Extracted | null> {
  const page = await fetchHtml(url);
  if (!page.usable) return null;
  const found = await extract(page.html, page.url, [], []);
  if (found) return found;
  const next = hops > 0 ? findOpeningsLink(page.html, page.url) : null;
  return next ? scrapeStatic(next, hops - 1) : null;
}

async function scrapeBrowser(
  url: string,
  hops: number,
  needsLocation: boolean,
): Promise<Extracted | "blocked" | null> {
  if (!(await robotsAllowed(url))) return null;
  const outcome = await withPage(url, async (page, capture) => {
    if (await isBlocked(page)) return { found: null, next: null, blocked: true };
    const attempt = async () => extract(await page.content(), page.url(), capture.requests, capture.json);
    let found = await attempt();
    if (!found && (await expandListings(page))) found = await attempt();

    if (!found || (needsLocation && lacksLocations(found))) {
      // Only responses after the filter change may count as the filtered list.
      capture.json.length = 0;
      if (await selectSerbia(page)) {
        const filtered = await attempt();
        if (filtered) {
          // Everything listed passed the page's own Serbia filter.
          if (filtered.source !== filtered.ats) {
            for (const job of filtered.jobs) if (!job.location && !job.countryCode) job.countryCode = "rs";
          }
          found = filtered;
        }
      }
    }
    if (found) return { found, next: null, blocked: false };
    const next = hops > 0 ? findOpeningsLink(await page.content(), page.url()) : null;
    return { found: null, next, blocked: false };
  });
  if (outcome.blocked) return "blocked";
  if (outcome.found) return outcome.found;
  return outcome.next ? scrapeBrowser(outcome.next, hops - 1, needsLocation) : null;
}

async function scrapeCompany(
  company: Company,
  careers: CareersResult,
  options: StageOptions,
): Promise<CompanyScrape> {
  const scrapedAt = new Date().toISOString();
  const ok = (found: Extracted): CompanyScrape => ({ status: "ok", error: null, scrapedAt, ...found });

  const knownAdapter = careers.ats && careers.atsSlug ? getAdapter(careers.ats) : null;
  if (knownAdapter && careers.atsSlug) {
    const jobs = await knownAdapter.fetchJobs(careers.atsSlug);
    return ok({ source: knownAdapter.name, ats: knownAdapter.name, atsSlug: careers.atsSlug, jobs, pageUrl: careers.careersUrl ?? "" });
  }

  const url = careers.careersUrl;
  const manual = (error: string): CompanyScrape => ({
    status: "needs_manual",
    source: null,
    ats: careers.ats,
    atsSlug: careers.atsSlug,
    pageUrl: url,
    jobs: [],
    error,
    scrapedAt,
  });
  if (!url) return manual("no careers URL");

  const needsLocation = company.offices.some((office) => !isSerbianPlace(office));
  const fromStatic = await scrapeStatic(url, 1);
  if (fromStatic && !(options.browser && needsLocation && lacksLocations(fromStatic))) {
    return ok(fromStatic);
  }
  let blocked = false;
  if (options.browser) {
    const fromBrowser = await scrapeBrowser(url, 1, needsLocation).catch(() => null);
    if (fromBrowser === "blocked") blocked = true;
    else if (fromBrowser) return ok(fromBrowser);
  }
  if (fromStatic) return ok(fromStatic);
  return manual(blocked ? "blocked by bot protection in the browser" : "no jobs found on the careers page");
}

function summary(scrape: CompanyScrape): string {
  if (scrape.status !== "ok") return `${scrape.status}: ${scrape.error}`;
  return `${scrape.jobs.length} jobs via ${scrape.source}`;
}

export async function runJobs(options: StageOptions): Promise<void> {
  const companies = await readData("companies.json", companiesFileSchema, []);
  const careers = await readData("careers.json", careersFileSchema, {});
  const scrapes = await readData("jobs-raw.json", scrapesFileSchema, {});

  const withCareers = companies.filter((company) => {
    const status = careers[company.jobertyId]?.status;
    return status === "found" || status === "ambiguous";
  });
  if (!withCareers.length) throw new Error("no careers pages yet; run `npm run scrape -- careers` first");
  const targets = selectCompanies(withCareers, options, (company) => {
    const previous = scrapes[company.jobertyId];
    return Boolean(previous) && Date.now() - Date.parse(previous.scrapedAt) < RESCRAPE_AFTER_MS;
  });
  console.log(`[jobs] ${targets.length} companies to scrape`);

  const save = createSaver(async () => {
    await writeData("jobs-raw.json", scrapes, scrapesFileSchema);
    await writeData("careers.json", careers, careersFileSchema);
  });
  let done = 0;
  await forEachLimit(
    targets,
    options.concurrency,
    async (company) => {
      const career = careers[company.jobertyId];
      let scrape: CompanyScrape;
      try {
        scrape = await scrapeCompany(company, career, options);
      } catch (error) {
        scrape = {
          status: "error",
          source: null,
          ats: career.ats,
          atsSlug: career.atsSlug,
          pageUrl: career.careersUrl,
          jobs: [],
          error: describeError(error),
          scrapedAt: new Date().toISOString(),
        };
      }
      scrapes[company.jobertyId] = scrape;
      // An ATS found on the careers page: the next run goes straight to its API.
      if (scrape.ats && scrape.atsSlug && getAdapter(scrape.ats) && scrape.ats !== career.ats) {
        careers[company.jobertyId] = { ...career, ats: scrape.ats, atsSlug: scrape.atsSlug };
      }
      logProgress("jobs", ++done, targets.length, company.name, summary(scrape));
      if (done % 20 === 0) await save();
    },
    options.signal,
  );
  await save();
  await runFinalize();
}
