import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { expireDueInvitations } from "@/lib/interviews/expire";

function authorized(header: string | null): boolean {
  if (!env.CRON_SECRET || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(env.CRON_SECRET);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called every 15 minutes by the server's timer (deploy/callback-interviews.timer): closes the invitations
// nobody answered by their deadline (features/interview-invitations.md). Without CRON_SECRET the route
// does not exist, and with a wrong one it answers 404 too, so it says nothing to a stranger.
export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) return new Response("Not found", { status: 404 });

  try {
    return Response.json(await expireDueInvitations());
  } catch (error) {
    console.error("expireDueInvitations failed:", error);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
