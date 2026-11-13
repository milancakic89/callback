import type { ReactNode } from "react";
import { LegalFooter } from "@/components/legal/legal-footer";
import { PublicHeader } from "@/components/public-header";

// The page around a legal text (features/legal-pages.md): the header every public page has (a signed-in
// visitor gets a way back to their own side, a signed-out one Log in), the text on a card, and the footer.
// The header's account link reads the session in its own Suspense boundary, so the text itself prerenders.
export function LegalPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-muted/30">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-8">{children}</div>
      </main>
      <LegalFooter />
    </div>
  );
}
