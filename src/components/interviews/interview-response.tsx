"use client";

import { CalendarCheckIcon, CalendarXIcon, ClockIcon, VideoIcon } from "lucide-react";
import { useActionState } from "react";
import { respondToInterview, type InterviewResponseState } from "@/app/interviews/[invitationId]/actions";
import { FormAlert } from "@/components/auth/form-feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDeadline, formatDuration, formatInterviewTime } from "@/lib/interviews/format";
import type { InvitationView } from "@/lib/interviews/respond";

// What the invitation email's link opens (features/interview-invitations.md): the interview, and Confirm
// and Decline while it is open. After an answer, or when the invitation is closed, the same card says
// where it stands, so a second visit shows the answer instead of asking again.
export function InterviewResponse({ initial, token }: { initial: InvitationView; token: string }) {
  const [state, formAction, pending] = useActionState(respondToInterview, { view: initial } satisfies InterviewResponseState);
  const view = state.view;

  return (
    <Card className="w-full max-w-xl shadow-md [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(8)]">
      <CardHeader>
        <CardTitle className="text-2xl">{titleFor(view)}</CardTitle>
        <CardDescription className="text-base">
          {view.jobTitle} at {view.companyName}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {view.state !== "unavailable" && <Details view={view} />}
        <Outcome view={view} />
        {state.error && <FormAlert state={{ error: state.error }} />}

        {view.state === "pending" && (
          <form action={formAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="invitationId" value={view.id} />
            <input type="hidden" name="token" value={token} />
            <Button type="submit" name="response" value="confirm" size="lg" disabled={pending} className="h-11 text-base">
              {pending ? "Saving…" : "Confirm"}
            </Button>
            <Button type="submit" name="response" value="decline" size="lg" variant="outline" disabled={pending} className="h-11 text-base">
              Decline
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function titleFor(view: InvitationView): string {
  switch (view.state) {
    case "pending":
      return "You're invited to an interview";
    case "confirmed":
      return "You're confirmed";
    case "declined":
      return "You declined";
    case "expired":
      return "This invitation has closed";
    case "cancelled":
      return "This interview was cancelled";
    case "unavailable":
      return "This invitation is no longer available";
  }
}

function Details({ view }: { view: InvitationView }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-start gap-2 text-base">
        <ClockIcon aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
        <span>
          {formatInterviewTime(view.startsAt, view.timeZone)}
          <span className="block text-sm text-muted-foreground">{formatDuration(view.durationMinutes)}, on Google Meet</span>
        </span>
      </p>
      {view.message && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
          <p className="mb-1 font-medium">A message from {view.companyName}</p>
          {/* Plain text, never HTML: the company typed it. */}
          <p className="whitespace-pre-wrap">{view.message}</p>
        </div>
      )}
    </div>
  );
}

function Outcome({ view }: { view: InvitationView }) {
  switch (view.state) {
    case "pending":
      return (
        <p className="text-sm text-muted-foreground">
          Please answer by {formatDeadline(view.expiresAt, view.timeZone)}. If we don&rsquo;t hear from you, the
          invitation closes.
        </p>
      );
    case "confirmed":
      return (
        <div className="grid gap-3">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <CalendarCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {view.companyName} has been told. Google is sending you a calendar invitation.
          </p>
          {view.meetUrl && (
            <a href={view.meetUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "lg", className: "h-11 text-base" })}>
              <VideoIcon aria-hidden /> Open Google Meet
            </a>
          )}
        </div>
      );
    case "declined":
      return (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CalendarXIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {view.companyName} has been told. Nothing else to do.
        </p>
      );
    case "expired":
      return (
        <p className="text-sm text-muted-foreground">
          The answer was due by {formatDeadline(view.expiresAt, view.timeZone)}. If you still want to talk,
          write to {view.companyName}.
        </p>
      );
    case "cancelled":
      return <p className="text-sm text-muted-foreground">{view.companyName} cancelled this interview.</p>;
    case "unavailable":
      return <p className="text-sm text-muted-foreground">The application this invitation belongs to is no longer active.</p>;
  }
}
