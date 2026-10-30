import { z } from "zod";
import { WORK_MODES } from "@/lib/jobs/types";

// What the "Create job" form submits (features/post-job.md). No `server-only`: the form imports the
// limits too. The same limits are check constraints on `job_postings`
// (supabase/migrations/20261030120000_job_postings_insert.sql).
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 10_000;
export const LOCATION_MAX = 200;
// CV filters (features/job-filters.md): up to FILTERS_MAX in all, required and nice-to-have together.
export const FILTERS_MAX = 20;
export const FILTER_MAX = 100;

// Browsers can submit a textarea's line breaks as CRLF; store and count them as one character.
const text = z.string().transform((value) => value.replace(/\r\n?/g, "\n").trim());

const tooLong = (max: number) => `Use at most ${max.toLocaleString("en-US")} characters.`;

// One list of filters, as typed: trimmed, blanks dropped, and a filter repeated in other letters
// (React, react) kept once, first one wins. A form that sends none is an empty list.
const filterList = z
  .array(text.pipe(z.string().max(FILTER_MAX, tooLong(FILTER_MAX))))
  .transform((filters) => {
    const seen = new Set<string>();
    return filters.filter((filter) => {
      const key = filter.toLowerCase();
      if (!filter || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .default([]);

export const jobPostingSchema = z.object({
  title: text.pipe(z.string().min(1, "Enter a title.").max(TITLE_MAX, tooLong(TITLE_MAX))),
  description: text.pipe(
    z.string().min(1, "Enter a description.").max(DESCRIPTION_MAX, tooLong(DESCRIPTION_MAX)),
  ),
  // Optional: an empty field is stored as null.
  location: text.pipe(z.string().max(LOCATION_MAX, tooLong(LOCATION_MAX))).transform((value) => value || null),
  workMode: z
    .enum([...WORK_MODES, ""], { error: "Choose a work mode from the list." })
    .transform((value) => (value === "" ? null : value)),
  requiredFilters: filterList,
  optionalFilters: filterList,
})
  // The two lists are checked together. `z.flattenError` files each issue under its first path
  // segment, so these show up as field errors on the list they name.
  .check((ctx) => {
    const { requiredFilters, optionalFilters } = ctx.value;

    const required = new Set(requiredFilters.map((filter) => filter.toLowerCase()));
    const repeated = optionalFilters.find((filter) => required.has(filter.toLowerCase()));
    if (repeated !== undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["optionalFilters"],
        message: `“${repeated}” is already a required filter.`,
      });
    }

    if (requiredFilters.length + optionalFilters.length > FILTERS_MAX) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["requiredFilters"],
        message: `Use at most ${FILTERS_MAX} filters in all.`,
      });
    }
  });

export type JobPostingInput = z.output<typeof jobPostingSchema>;
