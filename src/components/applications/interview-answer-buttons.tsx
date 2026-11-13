"use client";

import { useState, useTransition } from "react";
import { respondToMyInterview } from "@/app/(app)/applications/actions";
import { Button } from "@/components/ui/button";

// Confirm and Decline for a signed-in candidate (features/interview-invitations.md). The action refreshes
// the page, which then shows the answer; a failure stays here as a line of text.
export function InterviewAnswerButtons({ invitationId }: { invitationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function answer(response: "confirm" | "decline") {
    setError(null);
    startTransition(async () => {
      const result = await respondToMyInterview(invitationId, response);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => answer("confirm")}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => answer("decline")}>
          Decline
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
