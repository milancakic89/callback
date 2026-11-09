import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { homeFor } from "@/lib/auth/account-type";
import { getCurrentUser } from "@/lib/auth/dal";

// The top bar of the public pages a visitor of any kind may open: a posting and a company's page. The
// signed-out top bar (src/components/site-nav.tsx) is for visitors with no account; a candidate or an
// employer here needs a way back to their own side instead of "Log in". The account link reads the
// session, so it sits in its own Suspense boundary and the rest of the bar prerenders.
export function PublicHeader() {
  return (
    <header className="dark sticky top-0 z-50 border-b border-border bg-background text-foreground">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Callback home"
          className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo onDark className="h-[22px]" />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={null}>
            <HeaderAccount />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

const HEADER_LINK =
  "rounded-md px-3 py-1.5 text-[14px] whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

async function HeaderAccount() {
  await connection();
  const user = await getCurrentUser();

  if (user) {
    return (
      <Link href={homeFor(user.accountType, user.companySlug)} className={HEADER_LINK}>
        {user.accountType === "employer" ? "Your workspace" : "Dashboard"}
      </Link>
    );
  }
  return (
    <>
      <Link href="/sign-in" className={HEADER_LINK}>
        Log in
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[14px] font-medium whitespace-nowrap text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Get started
      </Link>
    </>
  );
}
