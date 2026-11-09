import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CvList } from "@/components/cvs/cv-list";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAccountType } from "@/lib/auth/dal";
import { getMyCvs } from "@/lib/cvs/queries";

export const metadata: Metadata = { title: "Your CVs | Callback" };

// The CVs on the candidate's account (features/candidate-cvs.md). The shell (sidebar, account block)
// lives in ../layout.tsx, whose <main> doesn't scroll from `md` up, so this page scrolls itself. The
// list reads cookies, so it loads inside Suspense.
export default function ProfilePage() {
  return (
    <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl">
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
          <AuthedCvList />
        </Suspense>
      </div>
    </div>
  );
}

async function AuthedCvList() {
  await connection();
  await requireAccountType("candidate");
  return <CvList cvs={await getMyCvs()} />;
}
