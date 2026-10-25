import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { homeFor, parseAccountType, type AccountType } from "@/lib/auth/account-type";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string; accountType: AccountType };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  return {
    id: data.claims.sub,
    email: data.claims.email ?? "",
    accountType: parseAccountType(data.claims.app_metadata?.account_type),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

// The real gate for each side of the app (proxy only redirects optimistically): a candidate on an
// employer page, or the other way round, is sent to their own home. Server Actions call it too.
export async function requireAccountType(type: AccountType): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.accountType !== type) redirect(homeFor(user.accountType));
  return user;
}
