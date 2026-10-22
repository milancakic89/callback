import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { detectWorkMode } from "../normalize";
import { readData } from "../store";
import { jobsFileSchema, type Job } from "../types";

const BATCH_SIZE = 200;

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
});

// The scraper runs outside Next, which loads .env.local itself, so read it here.
function loadEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Missing Supabase settings (see .env.example):\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

// `postedAt` is whatever the source gave: ISO with or without an offset, "… UTC", a bare date or
// Unix seconds. Postgres rejects the last one, and one bad value fails the whole batch.
function toTimestamp(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{10}$/.test(value)) return new Date(Number(value) * 1000).toISOString();
  // Values with no offset are read as UTC, not in the machine's timezone.
  const iso = value.replace(/ UTC$/, "Z").replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$|^\d{4}-\d{2}-\d{2}$/.test(iso);
  const time = Date.parse(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

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
    // The table only accepts http(s) links; anything else was scraped from a page we don't trust.
    url: job.url && /^https?:\/\//i.test(job.url) ? job.url : null,
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
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
}
