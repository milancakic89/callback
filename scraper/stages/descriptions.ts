import { getAdapter } from "../ats/registry";
import { extractJsonLdDescription, extractMainContentText } from "../extract/description";
import { fetchHtml } from "../http";
import { logProgress, type StageOptions } from "../options";
import { forEachLimit } from "../pool";
import { createSaver, readData, writeData } from "../store";
import { describeError } from "../text";
import { atsNameSchema, jobsFileSchema, type Job } from "../types";

// Generic fallback for sources with no adapter-specific detail call (dom, network, jsonld, joberty,
// and any ATS without a fetchDescription): fetch the job's own page and pull its JSON-LD, else the
// largest description-shaped block of text. Best-effort — many pages will still end up null.
async function fetchGenericDescription(url: string): Promise<string | null> {
  const page = await fetchHtml(url);
  if (!page.usable) return null;
  return extractJsonLdDescription(page.html) ?? extractMainContentText(page.html);
}

async function fetchDescription(job: Job): Promise<string | null> {
  const ats = atsNameSchema.safeParse(job.source);
  const adapter = ats.success ? getAdapter(ats.data) : null;
  if (adapter?.fetchDescription) {
    // id is "<source>:<externalId>"; externalId itself may contain a colon (none currently do, but don't assume).
    const externalId = job.id.slice(job.source.length + 1);
    const found = await adapter.fetchDescription({ externalId, url: job.url });
    if (found) return found;
  }
  return job.url ? fetchGenericDescription(job.url) : null;
}

function selectJobs(jobs: Job[], options: StageOptions): Job[] {
  const filters = options.only.map((value) => value.toLowerCase());
  const active = jobs.filter((job) => job.active);
  const matching = filters.length
    ? active.filter((job) => filters.some((value) => job.companyName.toLowerCase().includes(value)))
    : active;
  const pending = options.force || filters.length ? matching : matching.filter((job) => job.description === null);
  return options.limit ? pending.slice(0, options.limit) : pending;
}

// Stage 5 (optional): backfill `description` on jobs.json for active jobs that don't have one yet.
// Most ATS adapters already set it for free while fetching the job list (see `jobs`); this covers
// the rest with one extra request per job, so it's worth running only occasionally, not every scrape.
export async function runDescriptions(options: StageOptions): Promise<void> {
  const jobs = await readData("jobs.json", jobsFileSchema, []);
  if (!jobs.length) throw new Error("jobs.json is empty; run `npm run scrape -- jobs` first");

  const activeCount = jobs.filter((job) => job.active).length;
  const pending = selectJobs(jobs, options);
  console.log(`[descriptions] ${pending.length}/${activeCount} active jobs to fetch`);

  const byId = new Map(jobs.map((job) => [job.id, job]));
  const save = createSaver(() => writeData("jobs.json", [...byId.values()], jobsFileSchema));
  let done = 0;
  let found = 0;
  await forEachLimit(
    pending,
    options.concurrency,
    async (job) => {
      let description: string | null = null;
      let outcome = "not found";
      try {
        description = await fetchDescription(job);
      } catch (error) {
        outcome = describeError(error);
      }
      if (description) {
        found++;
        outcome = "found";
        byId.set(job.id, { ...job, description });
      }
      logProgress("descriptions", ++done, pending.length, job.companyName, outcome);
      if (done % 50 === 0) await save();
    },
    options.signal,
  );
  await save();
  console.log(`[descriptions] filled ${found}/${pending.length}`);
}
