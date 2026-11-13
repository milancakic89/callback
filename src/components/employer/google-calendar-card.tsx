import { CalendarCheckIcon } from "lucide-react";
import { disconnectGoogle } from "@/app/(employer)/[company]/(workspace)/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { GoogleStatus } from "@/lib/interviews/types";

// What `?google=` says after the employer comes back from Google, or from Disconnect.
const FLAGS: Record<string, { variant: "default" | "destructive"; text: string }> = {
  connected: { variant: "default", text: "Google Calendar is connected." },
  disconnected: { variant: "default", text: "Google Calendar is disconnected." },
  denied: { variant: "destructive", text: "Google Calendar was not connected: access was not given." },
  error: { variant: "destructive", text: "Something went wrong with Google Calendar. Try again." },
  not_configured: { variant: "destructive", text: "Google Calendar isn't set up on this server." },
};

// The company's Google Calendar (features/interview-invitations.md): the account that creates the Meet
// events for interview invitations. Connecting is a plain link to /api/google/connect, not a form: the CSP
// allows forms to our own address only, and the link ends at Google. A server component with no hooks;
// Disconnect is a form action.
export function GoogleCalendarCard({ status, flag }: { status: GoogleStatus; flag: string | undefined }) {
  const notice = flag ? FLAGS[flag] : undefined;

  return (
    <section className="grid max-w-3xl gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6" aria-labelledby="google-heading">
      <div className="grid gap-1">
        <h2 id="google-heading" className="text-lg font-semibold tracking-tight">
          Google Calendar
        </h2>
        <p className="text-sm text-muted-foreground">
          Interview invitations create a Google Meet event in your calendar and email the candidate to confirm or
          decline. Callback only creates and deletes the events it makes, and keeps your answer on each invitation.
        </p>
      </div>

      {notice && (
        <Alert variant={notice.variant}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}

      {!status.configured ? (
        <p className="text-sm text-muted-foreground">Google Calendar isn&rsquo;t set up on this server yet.</p>
      ) : status.connected ? (
        <div className="grid gap-3">
          <p className="flex items-center gap-2 text-sm">
            <CalendarCheckIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span>
              {status.broken ? "Needs to be connected again: " : "Connected as "}
              <span className="font-medium">{status.email}</span>
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {status.broken && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- a Route Handler that redirects to Google, not a page
              <a href="/api/google/connect" className={buttonVariants({})}>
                Reconnect
              </a>
            )}
            <form action={disconnectGoogle}>
              <Button type="submit" variant="outline">
                Disconnect
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div>
          {/* A link, not next/link: it must not be prefetched, and it ends at Google. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a Route Handler that redirects to Google, not a page */}
          <a href="/api/google/connect" className={buttonVariants({})}>
            Connect Google Calendar
          </a>
        </div>
      )}
    </section>
  );
}
