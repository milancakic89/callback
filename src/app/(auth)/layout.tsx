import Link from "next/link";
import { Logo } from "@/components/brand";
import { DarkSurface } from "@/components/dark-surface";

// The pre-sign-in pages stay dark, like the landing page they are reached from, so the first click
// doesn't switch products (features/visual-continuity.md). The `dark` class makes every shadcn
// component inside use the dark tokens; the signed-in app stays light.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
