"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { SETUP_PATH } from "@/lib/auth/account-type";
import { requireAccountType } from "@/lib/auth/dal";
import { companyHome } from "@/lib/companies/company";
import { getOwnCompany } from "@/lib/companies/get-company";
import { SLUG_RESERVED_MESSAGE, SLUG_TAKEN_MESSAGE, setUpCompanySchema } from "@/lib/companies/setup-schema";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

export type SetupFormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const HOUR = 60 * 60_000;
const GENERIC_ERROR = "Something went wrong. Please try again.";

// Both actions share one limit: it is an employer's first screen and they use it a few times.
async function isLimited(userId: string) {
  const { success } = await rateLimit({
    key: `set-up-company:${userId}`,
    limit: 10,
    windowMs: HOUR,
    store: postgresStore,
  });
  return !success;
}

// Puts the slug into the account's app_metadata, which only the secret key can write, and then
// refreshes the session so the cookie carries a JWT with it (proxy and homeFor read it from there).
// Supabase merges app_metadata, so account_type stays. On success it redirects, so it only ever
// returns when something failed; the company is saved by then, and /setup offers Continue.
async function enterWorkspace(userId: string, slug: string): Promise<"failed"> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { company_slug: slug },
  });
  if (error) {
    console.error("enterWorkspace updateUserById failed:", error.code, error.message);
    return "failed";
  }

  const supabase = await createClient();
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    console.error("enterWorkspace refreshSession failed:", refreshError.code, refreshError.message);
    return "failed";
  }

  redirect(companyHome(slug));
}

// The form on /setup (features/company-slugs.md), through useActionState. The company comes from the
// session, never from the form: set_up_company() finds the caller's own company (and makes it, with
// its demo job, if the employer comes here before any dashboard visit). The address is fixed once
// saved, so this runs once per company.
export async function setUpCompany(_prev: SetupFormState, formData: FormData): Promise<SetupFormState> {
  const parsed = setUpCompanySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const user = await requireAccountType("employer");

  if (await isLimited(user.id)) return { error: "Too many attempts. Please try again later." };

  const { name, slug } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_up_company", { p_name: name, p_slug: slug });
  if (error) {
    switch (error.code) {
      case "23505":
        return { fieldErrors: { slug: [SLUG_TAKEN_MESSAGE] } };
      case "23514":
        // The form already checked the shape, so this is a word only the database list reserves.
        return { fieldErrors: { slug: [SLUG_RESERVED_MESSAGE] } };
      case "22023":
        return { fieldErrors: { name: ["Enter your company's name."] } };
      case "55000":
        // Set up already (on another device, or the session never learned): Continue is for that.
        return redirect(SETUP_PATH);
      default:
        console.error("set_up_company failed:", error.code, error.message);
        return { error: GENERIC_ERROR };
    }
  }

  await enterWorkspace(user.id, slug);
  // The company is saved, but the account or the session wasn't updated: /setup now offers Continue.
  redirect(SETUP_PATH);
}

// Continue on /setup, for a company that has its address while the session doesn't know it yet.
// It changes nothing but the account's app_metadata and the session cookie.
export async function continueToCompany(): Promise<SetupFormState> {
  const user = await requireAccountType("employer");
  if (user.companySlug) redirect(companyHome(user.companySlug));

  if (await isLimited(user.id)) return { error: "Too many attempts. Please try again later." };

  const company = await getOwnCompany();
  // Nothing to continue to: the setup form is what /setup shows then.
  if (!company) redirect(SETUP_PATH);

  await enterWorkspace(user.id, company.slug);
  return { error: GENERIC_ERROR };
}
