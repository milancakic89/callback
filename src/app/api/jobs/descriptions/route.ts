import { getJobDescriptions } from "@/lib/jobs/queries";

// Public, same-origin only (no browser Supabase client — see project-overview/security.md).
// `getJobDescriptions` is itself cached (`'use cache'`), so this handler is cheap to call on
// every page load; see "With Cache Components" in the Next.js Route Handlers docs.
export async function GET() {
  const descriptions = await getJobDescriptions();
  return Response.json(descriptions);
}
