"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { requireAccountType } from "@/lib/auth/dal";
import { companyCacheTag, companyProfileSchema, PROFILE_SAVED_MESSAGE } from "@/lib/companies/profile";
import { rateLimit } from "@/lib/rate-limit";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

// The same shape as the other forms' states, so FormAlert and FieldError work with it. `message` is
// the "Saved" note: the form stays on the page after saving.
export type CompanyProfileFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// The company profile form (src/components/employer/company-profile-editor.tsx, features/company-profile.md),
// through useActionState. Which company is the session's: the slug comes from the signed-in
// employer's JWT, never from the form, and row level security only lets a company update its own
// row, and only these five columns (supabase/migrations/20261109160000_company_profiles.sql), so the
// name and the address cannot be changed from here. Saving expires the company's cache entry
// (updateTag, for read-your-own-writes, node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md),
// so the postings and the public page show the new text on the next visit.
export async function saveCompanyProfile(
  _prev: CompanyProfileFormState,
  formData: FormData,
): Promise<CompanyProfileFormState> {
  const parsed = companyProfileSchema.safeParse({
    description: textField(formData, "description"),
    website: textField(formData, "website"),
    industry: textField(formData, "industry"),
    size: textField(formData, "size"),
    headquarters: textField(formData, "headquarters"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const user = await requireAccountType("employer");
  // An employer who hasn't chosen the company's address has no profile to save: /setup comes first.
  if (!user.companySlug) return { error: "Set up your company first." };

  const { success } = await rateLimit({
    key: `company-profile:${user.id}`,
    limit: 30,
    windowMs: 60 * 60_000,
    store: postgresStore,
  });
  if (!success) return { error: "You've saved the profile a lot. Try again in an hour." };

  const { description, website, industry, size, headquarters } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ description, website, industry, size, headquarters })
    .eq("slug", user.companySlug)
    .select("slug");
  if (error) {
    console.error("saveCompanyProfile failed:", error.code, error.message);
    return { error: "Could not save the profile. Try again." };
  }
  // Row level security shows the update only the caller's own row, so no row is a company that isn't theirs.
  if (!data?.length) return { error: "Company not found." };

  updateTag(companyCacheTag(user.companySlug));
  return { message: PROFILE_SAVED_MESSAGE };
}
