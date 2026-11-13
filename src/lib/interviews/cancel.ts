import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accessTokenFor, ownCompanyId } from "@/lib/google/connection";
import { deleteEvent } from "@/lib/google/calendar";

// Cancels an open invitation of the signed-in employer's company (features/interview-invitations.md): the
// status first, through the database function that checks the company owns it, then the Google event.
// The cancelled status is what counts; if Google can't be reached the event is left for the company to
// remove by hand, and the employer is told so.

export type CancelResult = { ok: true; calendarCleaned: boolean } | { ok: false; error: string };

export async function cancelInvitation(supabase: SupabaseClient, invitationId: string): Promise<CancelResult> {
  const { data, error } = await supabase
    .rpc("cancel_interview_invitation", { p_invitation_id: invitationId })
    .single<{ event_id: string | null; was_confirmed: boolean }>();
  if (error || !data) {
    if (error?.message === "invitation_not_found") return { ok: false, error: "That invitation is already closed." };
    console.error("cancel_interview_invitation failed:", error?.code, error?.message);
    return { ok: false, error: "Could not cancel the invitation. Try again." };
  }
  if (!data.event_id) return { ok: true, calendarCleaned: true };

  try {
    const companyId = await ownCompanyId();
    if (!companyId) throw new Error("no company");
    // A confirmed candidate is a guest of the event, and Google tells guests it was cancelled.
    await deleteEvent(await accessTokenFor(companyId), data.event_id, data.was_confirmed);
    return { ok: true, calendarCleaned: true };
  } catch (cleanupError) {
    console.error("cancelInvitation: deleting the event failed:", cleanupError);
    return { ok: true, calendarCleaned: false };
  }
}
