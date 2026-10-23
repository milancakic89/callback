import { z } from "zod";
import { loadEnvLocal } from "./supabase";
import { describeError } from "./text";

const envSchema = z.object({
  // The app the dashboard runs on: http://localhost:3000 locally, the public origin in production.
  APP_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
  REVALIDATE_SECRET: z.string().min(32),
});

// Tells the app that public.jobs changed, so the dashboard drops its cached job list
// (cacheLife("hours")) — see src/app/api/jobs/revalidate/route.ts. Best-effort: the data is already
// written, and without this the dashboard still catches up within the hour.
export async function revalidateJobs(): Promise<void> {
  loadEnvLocal();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.log("[revalidate] skipped: set APP_URL and REVALIDATE_SECRET in .env.local to refresh the dashboard now");
    return;
  }
  const { APP_URL, REVALIDATE_SECRET } = parsed.data;
  const later = "the dashboard catches up within the hour";
  try {
    const res = await fetch(`${APP_URL}/api/jobs/revalidate`, {
      method: "POST",
      headers: { authorization: `Bearer ${REVALIDATE_SECRET}` },
      signal: AbortSignal.timeout(10_000),
    });
    console.log(
      res.ok
        ? `[revalidate] dashboard job list refreshed (${APP_URL})`
        : `[revalidate] ${APP_URL} answered HTTP ${res.status}; ${later}`,
    );
  } catch (error) {
    console.log(`[revalidate] ${APP_URL} unreachable (${describeError(error)}); ${later}`);
  }
}
