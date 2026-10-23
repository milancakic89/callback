import { detectWorkMode } from "../normalize";
import { revalidateJobs } from "../revalidate";
import { readData } from "../store";
import { createAdminClient, loadEnv, safeUrl, toTimestamp } from "../supabase";
import { jobsFileSchema, type Job } from "../types";

const BATCH_SIZE = 200;

// Column names match supabase/migrations/*_jobs.sql.
function toRow(job: Job) {
  return {
    id: job.id,
    company_joberty_id: job.companyJobertyId,
    company_name: job.companyName,
    title: job.title,
    location_raw: job.locationRaw,
    country: job.country,
    is_remote: job.isRemote,
    remote_scope: job.remoteScope,
    department: job.department,
    url: safeUrl(job.url),
    description: job.description,
    source: job.source,
    posted_at: toTimestamp(job.postedAt),
    first_seen_at: job.firstSeenAt,
    last_seen_at: job.lastSeenAt,
    active: job.active,
    // Only computed here, from the final description (finalize runs before descriptions backfill
    // it) — see detectWorkMode in ../normalize.ts and features/dashboard.md.
    work_mode: detectWorkMode(job),
  };
}

// Stage 6 (optional): upsert jobs.json into the Supabase `jobs` table. jobs.json keeps closed jobs
// (`active: false`), so an upsert by id also closes them in the database; nothing is deleted.
export async function runPublish(): Promise<void> {
  const jobs = await readData("jobs.json", jobsFileSchema, []);
  if (!jobs.length) throw new Error("jobs.json is empty; run `npm run scrape -- jobs` first");

  const env = loadEnv();
  const supabase = createAdminClient(env);

  const rows = jobs.map(toRow);
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const { error } = await supabase.from("jobs").upsert(batch, { onConflict: "id" });
    if (error) {
      throw new Error(`Upsert failed at rows ${start}-${start + batch.length}: ${error.message}`);
    }
    console.log(`[publish ${start + batch.length}/${rows.length}] upserted`);
  }

  const active = jobs.filter((job) => job.active).length;
  console.log(`[publish] done: ${rows.length} jobs (${active} active) → ${env.SUPABASE_URL}`);
  await revalidateJobs();
}
