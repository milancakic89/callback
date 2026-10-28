import { renderPage } from "../browser";
import { getAdapter } from "../ats/registry";
import { extractJsonLdDescription, extractMainContentText } from "../extract/description";
import { extractPostedAt } from "../extract/posted-at";
import { fetchHtml } from "../http";
import { logProgress, type StageOptions } from "../options";
import { forEachLimit } from "../pool";
import { createSaver, readData, writeData } from "../store";
import { describeError } from "../text";
import { atsNameSchema, jobsFileSchema, type Job } from "../types";

// A job whose page or detail call was read isn't read again for this long, whether or not it had a
// date: a page that gave none yesterday gives none today, and a daily run must not fetch a thousand
// company pages over and over.
const RECHECK_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

type Details = {
  description: string | null;
  postedAt: string | null;
  // The job's page (or the ATS's detail call) was actually read, so there is no point in asking again soon.
  checked: boolean;
};

// The job's own page as HTML. Many modern careers portals (IBM's among them) render the body
// client-side, so a plain fetch comes back empty; falling back to a headless render is what actually
// gets the real content there.
async function fetchPageHtml(url: string, useBrowser: boolean): Promise<string | null> {
  const page = await fetchHtml(url);
  let html = page.usable ? page.html : null;
  // robots.txt binds the browser too: a page fetchHtml refused for it is not rendered instead.
  if (!html && useBrowser && !page.blocked) {
    html = (await renderPage(url).catch(() => null))?.html ?? null;
  }
  return html;
}

// What the job's own source says about it that the list didn't: the description and the day it was
// posted. An ATS with a detail call asks it (Workday, BambooHR and SuccessFactors give both at once).
// Everything else (dom, network, talentlyft, joberty, and any ATS without one) is read from the job's
// own page: the JSON-LD a site publishes for Google for Jobs, else, for the description only, the
// largest description-shaped block of text. Best-effort — many pages end up with neither.
async function fetchDetails(job: Job, useBrowser: boolean, force: boolean): Promise<Details> {
  const ats = atsNameSchema.safeParse(job.source);
  const adapter = ats.success ? getAdapter(ats.data) : null;
  // id is "<source>:<externalId>"; externalId itself may contain a colon (none currently do, but don't assume).
  const externalId = job.id.slice(job.source.length + 1);

  let description: string | null = null;
  let postedAt: string | null = null;
  let checked = false;

  if (adapter?.fetchDetails) {
    const found = await adapter.fetchDetails({ externalId, url: job.url });
    if (found) {
      ({ description, postedAt } = found);
      checked = true;
    }
  } else if (adapter?.fetchDescription) {
    description = await adapter.fetchDescription({ externalId, url: job.url });
    checked = description !== null;
  }

  // An ATS that answered is trusted about the date: its pages are single-page apps with none in the
  // HTML. The page is read for what is still missing: a description (also one the list already gave,
  // on --force, which re-reads them all), or, for a source with no detail call, the date.
  const needsText = description === null && (job.description === null || force);
  const needsDate = postedAt === null && job.postedAt === null && !adapter?.fetchDetails;
  if (job.url && (needsText || needsDate)) {
    const html = await fetchPageHtml(job.url, useBrowser);
    if (html) {
      checked = true;
      description ??= extractJsonLdDescription(html) ?? extractMainContentText(html);
      postedAt ??= extractPostedAt(html);
    }
  }
  return { description, postedAt, checked };
}

function selectJobs(jobs: Job[], options: StageOptions, now: number): Job[] {
  const filters = options.only.map((value) => value.toLowerCase());
  const active = jobs.filter((job) => job.active);
  const matching = filters.length
    ? active.filter((job) => filters.some((value) => job.companyName.toLowerCase().includes(value)))
    : active;
  const recentlyChecked = (job: Job) =>
    job.detailsCheckedAt !== null && now - Date.parse(job.detailsCheckedAt) < RECHECK_AFTER_MS;
  const pending =
    options.force || filters.length
      ? matching
      : matching.filter((job) => !recentlyChecked(job) && (job.description === null || job.postedAt === null));
  return options.limit ? pending.slice(0, options.limit) : pending;
}

// Stage 5: backfill `description` and `postedAt` on jobs.json for active jobs that lack one, from the
// job's own source. Most ATS adapters already set both for free while fetching the job list (see
// `jobs`); this covers the rest with one extra request per job, once, and again only after
// RECHECK_AFTER_MS. A job whose source has no posting date keeps `postedAt` null, and the dashboard
// then shows when the scraper first saw it (features/dashboard.md).
export async function runDescriptions(options: StageOptions): Promise<void> {
  const jobs = await readData("jobs.json", jobsFileSchema, []);
  if (!jobs.length) throw new Error("jobs.json is empty; run `npm run scrape -- jobs` first");

  const activeCount = jobs.filter((job) => job.active).length;
  const pending = selectJobs(jobs, options, Date.now());
  console.log(`[descriptions] ${pending.length}/${activeCount} active jobs to fetch`);

  const byId = new Map(jobs.map((job) => [job.id, job]));
  const save = createSaver(() => writeData("jobs.json", [...byId.values()], jobsFileSchema));
  let done = 0;
  let descriptions = 0;
  let dates = 0;
  await forEachLimit(
    pending,
    options.concurrency,
    async (job) => {
      let found: Details | null = null;
      let outcome = "nothing new";
      try {
        found = await fetchDetails(job, options.browser, options.force);
      } catch (error) {
        outcome = describeError(error);
      }
      if (found) {
        // A description the list gave is better than a guess from the page's text, so it is only
        // replaced on --force. The source's own date is never replaced.
        const description = job.description === null || options.force ? (found.description ?? job.description) : job.description;
        const postedAt = job.postedAt ?? found.postedAt;
        const gained = [
          description !== job.description ? "description" : null,
          postedAt !== job.postedAt ? "date" : null,
        ].filter((what) => what !== null);
        if (description !== job.description) descriptions++;
        if (postedAt !== job.postedAt) dates++;
        if (gained.length) outcome = `found ${gained.join(" + ")}`;
        byId.set(job.id, {
          ...job,
          description,
          postedAt,
          detailsCheckedAt: found.checked ? new Date().toISOString() : job.detailsCheckedAt,
        });
      }
      logProgress("descriptions", ++done, pending.length, job.companyName, outcome);
      if (done % 50 === 0) await save();
    },
    options.signal,
  );
  await save();
  console.log(`[descriptions] filled ${descriptions} descriptions and ${dates} posting dates of ${pending.length} jobs`);
}
