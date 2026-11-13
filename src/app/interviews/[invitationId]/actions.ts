"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { answerInvitation, type InvitationView } from "@/lib/interviews/respond";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { postgresStore } from "@/lib/supabase/rate-limit-store";

export type InterviewResponseState = { view: InvitationView; error?: string };

const schema = z.object({
  invitationId: z.uuid(),
  token: z.string().min(1).max(100),
  response: z.enum(["confirm", "decline"]),
});

// Confirm or Decline, from the page the email leads to (features/interview-invitations.md). Only ever a
// POST from this page's form: the link in the email just opens the page, because mail scanners follow
// links, and one that answered on a GET would answer for the candidate. The token is the proof of who is
// answering; it is checked again here, not trusted from the page.
export async function respondToInterview(prev: InterviewResponseState, formData: FormData): Promise<InterviewResponseState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ...prev, error: "Something went wrong. Reload the page and try again." };
  const { invitationId, token, response } = parsed.data;

  const ip = getClientIp(await headers());
  for (const [key, limit] of [
    [`interview-respond:ip:${ip}`, 30],
    [`interview-respond:${invitationId}`, 10],
  ] as const) {
    const { success } = await rateLimit({ key, limit, windowMs: 15 * 60_000, store: postgresStore });
    if (!success) return { ...prev, error: "Too many attempts. Try again in a few minutes." };
  }

  try {
    const result = await answerInvitation(invitationId, response, { kind: "token", token });
    if (result.ok) return { view: result.view };
    if (result.reason === "closed") return { view: result.view };
    return { ...prev, error: "This link isn't valid anymore." };
  } catch (error) {
    console.error("respondToInterview failed:", error);
    return { ...prev, error: "Could not save your answer. Try again." };
  }
}
