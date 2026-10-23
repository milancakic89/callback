import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const authorizationSchema = z.string().regex(/^Bearer \S{1,512}$/);

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Called by the scraper (scraper/revalidate.ts) once `publish` or `boards` has written to
// public.jobs, so the cached job list and descriptions (tag "jobs", src/lib/jobs/queries.ts)
// refresh on the next visit instead of within the hour. See features/job-boards.md.
export async function POST(request: Request) {
  const { success } = await rateLimit({
    key: `revalidate-jobs:${getClientIp(request.headers)}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!success) return new Response("Too many requests", { status: 429 });

  if (!env.REVALIDATE_SECRET) return new Response("Not found", { status: 404 });

  const authorization = authorizationSchema.safeParse(request.headers.get("authorization"));
  // Digests have equal length, which timingSafeEqual requires, and hide the secret's length.
  const authorized =
    authorization.success &&
    timingSafeEqual(digest(authorization.data.slice("Bearer ".length)), digest(env.REVALIDATE_SECRET));
  if (!authorized) return new Response("Unauthorized", { status: 401 });

  // Expire, not stale-while-revalidate: closed jobs should be gone on the very next visit.
  revalidateTag("jobs", { expire: 0 });
  return Response.json({ revalidated: true });
}
