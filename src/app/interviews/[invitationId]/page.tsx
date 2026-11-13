import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { InterviewResponse } from "@/components/interviews/interview-response";
import { Skeleton } from "@/components/ui/skeleton";
import { loadInvitationView } from "@/lib/interviews/respond";

// The token is in the address, so the page keeps it out of search results and out of the Referer of the
// links on it (the Meet link).
export const metadata: Metadata = {
  title: "Interview invitation | Callback",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Params = Promise<{ invitationId: string }>;
type SearchParams = Promise<{ t?: string | string[] }>;

// The page an invitation email leads to (features/interview-invitations.md). It shows the invitation and
// the two buttons; it never answers by itself. The id and the token are per-request data, so they are
// read inside Suspense. A wrong id or token is the ordinary not-found page, which doesn't say whether
// the invitation exists.
export default function InterviewPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full max-w-xl rounded-xl" />}>
      <LoadedInvitation params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function LoadedInvitation({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await connection();
  const { invitationId } = await params;
  const { t } = await searchParams;
  if (!z.uuid().safeParse(invitationId).success || typeof t !== "string" || t.length === 0 || t.length > 100) notFound();

  const view = await loadInvitationView(invitationId, { kind: "token", token: t });
  if (!view) notFound();

  return <InterviewResponse initial={view} token={t} />;
}
