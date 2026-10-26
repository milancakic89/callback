import { connection } from "next/server";
import { env } from "@/lib/env";

// What the deploy checks after starting a release (deploy/activate-release.sh) to tell a working one
// from a broken one. It must run at request time and read the validated environment: the pages are
// prerendered, so a release started with a missing or invalid variable still answers them with 200,
// while this route answers 500 (src/lib/env.ts throws on import). It exposes nothing.
export async function GET() {
  await connection();
  return Response.json({ ok: Boolean(env.APP_URL) });
}
