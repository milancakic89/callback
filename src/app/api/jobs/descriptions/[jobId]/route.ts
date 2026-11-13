import { getJobDescription } from "@/lib/jobs/queries";

// One job's description, for the sheet that opens from the table (features/performance.md), so that
// a visitor who only reads a few doesn't download all 28 MB of them (../route.ts is that bundle, for
// the Description filter). `jobId` is the table's list id, URL-encoded: a scraped job's id can hold a
// "/" or a space. Public, same-origin only. 404 for a job with no description and for an id that
// isn't one; getJobDescription checks the id before its cache sees it.
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const description = await getJobDescription(jobId);
  if (description === null) return new Response("Not found", { status: 404 });
  return Response.json({ description });
}
