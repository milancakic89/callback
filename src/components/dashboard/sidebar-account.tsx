import { connection } from "next/server";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";

// The sidebar's account block (email + sign out), shared by the candidate and employer shells. It
// reads cookies, so callers render it inside a Suspense boundary.
export async function SidebarAccount() {
  // Opt out of prerendering: the Supabase client reads Date.now() while verifying the JWT.
  await connection();
  const user = await requireUser();

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border p-3">
      <span className="truncate text-xs text-muted-foreground" title={user.email}>
        {user.email}
      </span>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
