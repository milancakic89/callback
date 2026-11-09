"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { postingNext } from "@/lib/auth/safe-next";

// A link from sign-in to sign-up (or back) that keeps `?next=` when it is a posting to come back to
// (features/candidate-cvs.md), so a candidate who picks the other form still returns to the job.
export function KeepNextLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const next = postingNext(useSearchParams().get("next"));
  return (
    <Link href={next ? `${href}?next=${encodeURIComponent(next)}` : href} className={className}>
      {children}
    </Link>
  );
}
