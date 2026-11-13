import { getActiveJobs } from "@/lib/jobs/queries";

// The whole job list, for the explorer on /jobs and /dashboard to load once the page is up
// (features/performance.md): the pages themselves carry only the first rows. Public, same-origin
// only (no browser Supabase client; project-overview/security.md). `getActiveJobs` is cached under
// the tag "jobs", like the descriptions, so this handler is prerendered, refreshed by the same
// revalidateTag/updateTag calls, and costs nothing per request. Caddy compresses it and sets its
// Cache-Control (deploy/Caddyfile).
export async function GET() {
  const jobs = await getActiveJobs();
  return Response.json(jobs);
}
