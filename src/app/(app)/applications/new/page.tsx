import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AddExternalApplicationForm } from "@/components/applications/add-external-application-form";
import { AlreadyTracked, InvalidTrackLink } from "@/components/applications/external-application-notices";
import { Skeleton } from "@/components/ui/skeleton";
import { findExternalApplication } from "@/lib/applications/queries";
import { requireAccountType } from "@/lib/auth/dal";
import { getMyCvs } from "@/lib/cvs/queries";
import { parseTrackQuery, type TrackSearchParams } from "@/lib/external-jobs/track-query";

// The job's title and company are in the address, which a site that links here sees as the Referer of
// whatever this page opens, and a search engine has no business with it.
export const metadata: Metadata = {
  title: "Add an application | Callback",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type SearchParams = Promise<Exclude<TrackSearchParams, URLSearchParams>>;

// Where the "Add to Callback" button of the browser extension leads (features/chrome-extension.md). The
// address carries the job the candidate was looking at: it is read as untrusted, and opening the page
// writes nothing, only the form's Save does (a Server Action). The shell (sidebar, account block) lives
// in ../../layout.tsx, whose <main> doesn't scroll from `md` up, so this page scrolls itself. The
// address and the session are per-request data, so they are read inside Suspense.
export default function NewApplicationPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
      <div className="mx-auto w-full max-w-xl">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <AuthedNewApplication searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

// An employer is sent to their own home by requireAccountType, and a visitor without a session to
// sign-in (the proxy already did, with `?next=` back to this address).
async function AuthedNewApplication({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireAccountType("candidate");

  const parsed = parseTrackQuery(await searchParams);
  if (!parsed.ok) return <InvalidTrackLink />;

  const [tracked, cvs] = await Promise.all([findExternalApplication(user.id, parsed.value.url), getMyCvs()]);
  if (tracked) return <AlreadyTracked title={tracked.title} companyName={tracked.companyName} status={tracked.status} />;

  return <AddExternalApplicationForm job={parsed.value} cvs={cvs} />;
}
