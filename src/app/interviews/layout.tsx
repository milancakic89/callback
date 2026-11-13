import Link from "next/link";
import { Logo } from "@/components/brand";
import { DarkSurface } from "@/components/dark-surface";

// The page an invitation email leads to (features/interview-invitations.md). The candidate may have no
// account and no session, so it is outside both sides of the app, and dark like the other pages a
// stranger lands on (features/visual-continuity.md).
export default function InterviewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="dark dark-top-light flex flex-1 flex-col items-center justify-center gap-6 bg-background p-4 text-foreground">
      <DarkSurface />
      <Link href="/" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <Logo onDark className="h-7" />
      </Link>
      {children}
    </main>
  );
}
