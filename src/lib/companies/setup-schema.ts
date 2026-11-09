import { z } from "zod";
import {
  COMPANY_NAME_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  slugProblem,
} from "./company";

export const SLUG_FORMAT_MESSAGE = `Use ${SLUG_MIN_LENGTH} to ${SLUG_MAX_LENGTH} letters, numbers or hyphens, with no hyphen at either end.`;
export const SLUG_RESERVED_MESSAGE = "This address isn't available. Try another.";
export const SLUG_TAKEN_MESSAGE = "This address is taken.";

// What the setup form (/setup) submits. The database checks the same rules again
// (set_up_company in supabase/migrations/20261109120000_company_slugs.sql).
export const setUpCompanySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your company's name.")
    .max(COMPANY_NAME_MAX_LENGTH, `Use at most ${COMPANY_NAME_MAX_LENGTH} characters.`),
  slug: z.string().superRefine((slug, ctx) => {
    const problem = slugProblem(slug);
    if (problem === "format") ctx.addIssue({ code: "custom", message: SLUG_FORMAT_MESSAGE });
    if (problem === "reserved") ctx.addIssue({ code: "custom", message: SLUG_RESERVED_MESSAGE });
  }),
});
