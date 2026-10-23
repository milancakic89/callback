import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
});

// The scraper runs outside Next, which loads .env.local itself, so read it here.
export function loadEnvLocal(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function loadEnv() {
  loadEnvLocal();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Missing Supabase settings (see .env.example):\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

// The secret key bypasses RLS: `jobs` has no write policies for anon or authenticated.
export function createAdminClient(env: ReturnType<typeof loadEnv>) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// `postedAt` is whatever the source gave: ISO with or without an offset, "… UTC", a bare date or
// Unix seconds. Postgres rejects the last one, and one bad value fails the whole batch.
export function toTimestamp(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{10}$/.test(value)) return new Date(Number(value) * 1000).toISOString();
  // Values with no offset are read as UTC, not in the machine's timezone.
  const iso = value.replace(/ UTC$/, "Z").replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$|^\d{4}-\d{2}-\d{2}$/.test(iso);
  const time = Date.parse(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

// The table only accepts http(s) links; anything else was scraped from a page we don't trust.
export function safeUrl(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}
