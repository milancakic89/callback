import { arbeitnow } from "../boards/arbeitnow";
import { BOARD_NAMES, type BoardAdapter, type BoardJob, type BoardJobStatus, type BoardName } from "../boards/board";
import { himalayas } from "../boards/himalayas";
import { jobicy } from "../boards/jobicy";
import { remoteok } from "../boards/remoteok";
import { remotive } from "../boards/remotive";
import { detectWorkMode, placeBoardJob, type Placement } from "../normalize";
import { revalidateJobs } from "../revalidate";
import { readData, writeData } from "../store";
import { createAdminClient, loadEnv, safeUrl, toTimestamp } from "../supabase";
import { coreName, describeError, plain } from "../text";
import { jobsFileSchema } from "../types";

// Same order as BOARD_NAMES, which is also the dedupe priority.
const BOARDS: BoardAdapter[] = [himalayas, jobicy, remoteok, remotive, arbeitnow];

const UPSERT_BATCH = 200;
// Ids go into the request URL (`id=in.(…)`), so keep each batch well under URL length limits.
const CLOSE_BATCH = 50;
const PAGE_SIZE = 1000;
// Jobicy (7 days) and RemoteOK (newest ~100) are short windows: a job missing from the feed may
// still be open, so it stays active this long after posting unless shown closed.
const SHORT_FEEDS = new Set<BoardName>(["jobicy", "remoteok"]);
const GRACE_MS = 30 * 24 * 60 * 60 * 1000;

type ExistingRow = {
  id: string;
  source: BoardName;
  company_name: string;
  title: string;
  first_seen_at: string;
  posted_at: string | null;
  active: boolean;
};

type Kept = { source: BoardName; job: BoardJob; placement: Placement };

type SourceReport = {
  status: "ok" | "failed";
  error: string | null;
  fetched: number;
  kept: number;
  outsideSerbia: number;
  duplicates: number;
  closed: number;
  // Missing from a short feed but still within GRACE_MS and not shown closed.
  stillActive: number;
};

// "Fivetran Serbia" / "Senior Engineer (Remote)" and "Fivetran" / "Senior Engineer - Remote" match.
function dedupeKey(companyName: string, title: string): string {
  const company = coreName(companyName) || plain(companyName);
  return `${company}|${plain(title).replace(/[^a-z0-9]+/g, " ").trim()}`;
}

function toRow({ source, job, placement }: Kept, firstSeenAt: string, now: string) {
  return {
    id: `${source}:${job.externalId}`,
    company_joberty_id: null,
    company_name: job.companyName,
    title: job.title,
    location_raw: job.location,
    country: placement.country,
    is_remote: placement.isRemote,
    remote_scope: placement.remoteScope,
    department: job.department,
    url: safeUrl(job.url),
    description: job.description,
    source,
    posted_at: toTimestamp(job.postedAt),
    first_seen_at: firstSeenAt,
    last_seen_at: now,
    active: true,
    work_mode: detectWorkMode({ ...job, locationRaw: job.location, isRemote: placement.isRemote }),
  };
}

// Pull remote jobs open to Serbia from public job boards and make the database match them: new
// and still-listed jobs are upserted, jobs a board no longer lists become inactive (never deleted:
// `applications` cascades on delete). A board that fails keeps its rows as they were. Runs after
// `publish`, and leaves the scraper's own rows alone. See features/job-boards.md.
export async function runBoards(signal: AbortSignal): Promise<void> {
  // Before minutes of fetching, not after.
  const env = loadEnv();
  const supabase = createAdminClient(env);

  const scraped = (await readData("jobs.json", jobsFileSchema, [])).filter((job) => job.active);
  if (!scraped.length) console.warn("[boards] jobs.json has no active jobs; skipping dedupe against the scraper");
  // The scraper's copy wins: it links straight to the company's own ATS.
  const taken = new Set(scraped.map((job) => dedupeKey(job.companyName, job.title)));

  const report = Object.fromEntries(
    BOARD_NAMES.map((name) => [
      name,
      { status: "failed", error: "not run", fetched: 0, kept: 0, outsideSerbia: 0, duplicates: 0, closed: 0, stillActive: 0 },
    ]),
  ) as Record<BoardName, SourceReport>;
  const fetchedIds = new Set<string>();
  const kept = new Map<string, Kept>();

  for (const board of BOARDS) {
    const entry = report[board.name];
    if (signal.aborted) {
      entry.error = "interrupted";
      continue;
    }
    let jobs: BoardJob[];
    try {
      jobs = await board.fetchJobs();
      // An empty feed is far more likely a broken API than every job closing at once.
      if (!jobs.length) throw new Error("feed returned no jobs");
    } catch (error) {
      entry.error = describeError(error);
      console.log(`[boards ${board.name}] failed, its jobs stay as they were: ${entry.error}`);
      continue;
    }
    entry.status = "ok";
    entry.error = null;
    entry.fetched = jobs.length;
    for (const job of jobs) {
      const id = `${board.name}:${job.externalId}`;
      fetchedIds.add(id);
      const placement = placeBoardJob(job);
      if (!placement.keep) {
        entry.outsideSerbia++;
        continue;
      }
      const key = dedupeKey(job.companyName, job.title);
      if (taken.has(key)) {
        entry.duplicates++;
        continue;
      }
      taken.add(key);
      kept.set(id, { source: board.name, job, placement });
      entry.kept++;
    }
    console.log(
      `[boards ${board.name}] ${entry.fetched} fetched, ${entry.kept} kept, ` +
        `${entry.outsideSerbia} not open to Serbia, ${entry.duplicates} duplicates`,
    );
  }

  const existing: ExistingRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, source, company_name, title, first_seen_at, posted_at, active")
      .in("source", [...BOARD_NAMES])
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
      .returns<ExistingRow[]>();
    if (error) throw new Error(`Reading existing board jobs failed: ${error.message}`);
    existing.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const existingById = new Map(existing.map((row) => [row.id, row]));

  const now = new Date().toISOString();
  const rows = [...kept.entries()].map(([id, item]) => toRow(item, existingById.get(id)?.first_seen_at ?? now, now));
  for (let start = 0; start < rows.length; start += UPSERT_BATCH) {
    const batch = rows.slice(start, start + UPSERT_BATCH);
    const { error } = await supabase.from("jobs").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`Upsert failed at rows ${start}-${start + batch.length}: ${error.message}`);
  }
  const added = rows.filter((row) => !existingById.has(row.id)).length;

  // Active rows of a board that read fine but no longer lists them.
  const missing = existing.filter(
    (row) => row.active && report[row.source]?.status === "ok" && !kept.has(row.id),
  );
  const toClose: ExistingRow[] = [];
  const graceCandidates: ExistingRow[] = [];
  for (const row of missing) {
    const agedOut =
      SHORT_FEEDS.has(row.source) &&
      // Still in the feed, but filtered out or a duplicate now: close it.
      !fetchedIds.has(row.id) &&
      // A job just kept from another board (or the scraper) now covers it.
      !taken.has(dedupeKey(row.company_name, row.title)) &&
      Date.now() - Date.parse(row.posted_at ?? row.first_seen_at) < GRACE_MS;
    (agedOut ? graceCandidates : toClose).push(row);
  }

  // Jobicy can say whether a job that aged out of its feed is still open; RemoteOK can't.
  const jobicyIds = graceCandidates
    .filter((row) => row.source === "jobicy")
    .map((row) => row.id.slice("jobicy:".length));
  let jobicyStatus = new Map<string, BoardJobStatus>();
  if (jobicyIds.length && jobicy.checkStatus) {
    try {
      jobicyStatus = await jobicy.checkStatus(jobicyIds);
    } catch (error) {
      console.log(`[boards jobicy] status check failed, keeping those jobs: ${describeError(error)}`);
    }
  }
  for (const row of graceCandidates) {
    // "unknown" is unconfirmed, not closed (Jobicy's docs); the grace period still ends it.
    const closed = row.source === "jobicy" && jobicyStatus.get(row.id.slice("jobicy:".length)) === "closed";
    if (closed) toClose.push(row);
    else report[row.source].stillActive++;
  }

  for (let start = 0; start < toClose.length; start += CLOSE_BATCH) {
    const ids = toClose.slice(start, start + CLOSE_BATCH).map((row) => row.id);
    const { error } = await supabase.from("jobs").update({ active: false }).in("id", ids);
    if (error) throw new Error(`Closing jobs failed at ${start}-${start + ids.length}: ${error.message}`);
  }
  for (const row of toClose) report[row.source].closed++;

  await writeData("boards-report.json", { generatedAt: now, upserted: rows.length, added, sources: report });
  const failed = BOARD_NAMES.filter((name) => report[name].status === "failed");
  console.log(
    `[boards] done: ${rows.length} active (${added} new), ${toClose.length} closed` +
      (failed.length ? `; failed: ${failed.join(", ")}` : "") +
      ` → ${env.SUPABASE_URL}`,
  );
  await revalidateJobs();
}
