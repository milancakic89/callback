import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/applications/types";
import { tooLong } from "@/lib/validation/text-fields";
import { cleanLinkText, COMPANY_MAX, EXTERNAL_APPLICATIONS_MAX, LOCATION_MAX, TITLE_MAX } from "./track-link";
import { jobUrlSchema } from "./track-query";

// What the form on /applications/new submits (features/chrome-extension.md). The address is read again
// as untrusted, whatever the page showed: it is reduced to its canonical form and its source comes from
// its host. Unlike the prefilled query, a value that is too long is an error here, not cut: the
// candidate typed it.

export const TITLE_REQUIRED_MESSAGE = "Enter the job title.";
export const COMPANY_REQUIRED_MESSAGE = "Enter the company.";
export const ALREADY_ADDED_MESSAGE = "Already in your applications.";
export const LIMIT_MESSAGE = `You can keep up to ${EXTERNAL_APPLICATIONS_MAX.toLocaleString("en-US")} jobs from other sites. Remove one to add another.`;

const requiredText = (max: number, missing: string) =>
  z
    .string()
    .transform(cleanLinkText)
    .pipe(z.string().min(1, missing).max(max, tooLong(max)));

// Optional; an empty box is no location.
const optionalLocation = z
  .string()
  .optional()
  .transform((value) => cleanLinkText(value ?? ""))
  .pipe(z.string().max(LOCATION_MAX, tooLong(LOCATION_MAX)))
  .transform((value) => value || null);

export const addExternalApplicationSchema = z.object({
  url: jobUrlSchema,
  title: requiredText(TITLE_MAX, TITLE_REQUIRED_MESSAGE),
  company: requiredText(COMPANY_MAX, COMPANY_REQUIRED_MESSAGE),
  location: optionalLocation,
  // Empty is "No CV". A CV is the candidate's own by the database's foreign key, which refuses another's.
  cvId: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((value) => value || null),
  status: z.enum(APPLICATION_STATUSES),
});

export type AddExternalApplicationInput = z.output<typeof addExternalApplicationSchema>;
