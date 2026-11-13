import "server-only";
import { accessTokenFor } from "@/lib/google/connection";
import { deleteEvent } from "@/lib/google/calendar";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Closes the invitations nobody answered by their deadline (features/interview-invitations.md): the
// status becomes `expired` and the event goes from the company's calendar. Run by the timer on the server
// through POST /api/interviews/expire. Until it has run the screens already read a pending invitation
// past its deadline as expired (effectiveStatus()), so this only makes the data and the calendar agree.

const BATCH = 100;

type DueRow = { id: string; company_id: string; google_event_id: string | null };

export async function expireDueInvitations(now = new Date()): Promise<{ expired: number; failed: number }> {
  const { data, error } = await supabaseAdmin
    .from("interview_invitations")
    .select("id, company_id, google_event_id")
    .eq("status", "pending")
    .lte("expires_at", now.toISOString())
    .order("expires_at", { ascending: true })
    .limit(BATCH)
    .returns<DueRow[]>();
  if (error) throw new Error(`expireDueInvitations: ${error.message}`);

  // One access token per company for the whole run.
  const tokens = new Map<string, Promise<string | null>>();
  const tokenFor = (companyId: string) => {
    let token = tokens.get(companyId);
    if (!token) {
      token = accessTokenFor(companyId).catch((tokenError) => {
        console.error("expireDueInvitations: no access token for", companyId, tokenError);
        return null;
      });
      tokens.set(companyId, token);
    }
    return token;
  };

  let expired = 0;
  let failed = 0;
  for (const row of data ?? []) {
    // Conditional, so an answer that arrived a moment ago is not overwritten.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("interview_invitations")
      .update({ status: "expired" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (updateError) {
      failed += 1;
      continue;
    }
    if (!updated?.length) continue;
    expired += 1;

    if (!row.google_event_id) continue;
    const accessToken = await tokenFor(row.company_id);
    if (!accessToken) continue;
    await deleteEvent(accessToken, row.google_event_id, false).catch((deleteError) => {
      failed += 1;
      console.error("expireDueInvitations: deleting the event failed:", deleteError);
    });
  }
  return { expired, failed };
}
