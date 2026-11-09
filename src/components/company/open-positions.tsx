import { MapPinIcon } from "lucide-react";
import Link from "next/link";
import { WorkModeBadge } from "@/components/jobs/work-mode-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAbsolute } from "@/lib/jobs/format";
import { postingPath, type PublishedJob } from "@/lib/jobs/published";

// The jobs a company has published, on its own page (features/company-profile.md): each one links to
// its posting. The date is absolute and in UTC, so the page renders the same on the server and in the
// browser and needs no clock.
export function OpenPositions({ jobs }: { jobs: PublishedJob[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Open positions ({jobs.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open positions right now.</p>
        ) : (
          <ul className="divide-y">
            {jobs.map((job) => (
              <li key={job.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={postingPath(job.id)}
                  className="block rounded-sm font-medium wrap-anywhere underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {job.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {job.locationRaw && (
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon aria-hidden className="size-3.5" /> {job.locationRaw}
                    </span>
                  )}
                  {job.workMode && <WorkModeBadge workMode={job.workMode} />}
                  <span>Posted {formatAbsolute(job.publishedAt, "UTC")}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
