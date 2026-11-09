import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand";
import { DarkSurface } from "@/components/dark-surface";

// The screen an employer sees once, between activating the account and the first dashboard
// (features/company-slugs.md). It looks like the auth pages it follows (features/visual-continuity.md):
// dark, a card on a plain background, so the first screen after the email link doesn't switch
// products. It has no app chrome, since there is no company to show a sidebar for yet; Sign out is
// here so a wrong account isn't a dead end.
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="dark dark-top-light flex flex-1 flex-col items-center justify-center gap-6 bg-background p-4 text-foreground">
      <DarkSurface />
      <Link href="/" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <Logo onDark className="h-7" />
      </Link>
      {children}
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
