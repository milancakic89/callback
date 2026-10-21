import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Dashboard | Job Manager" };

// Placeholder until Phase 2 adds the authenticated shell.
export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <CurrentUser />
      </Suspense>
    </main>
  );
}

async function CurrentUser() {
  // Opt out of prerendering: the Supabase client reads Date.now() while verifying the JWT.
  await connection();
  const user = await requireUser();

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.email}</span>
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
