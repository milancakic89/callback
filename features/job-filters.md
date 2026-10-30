# Feature: CV Filters on a Job

**Status:** Implemented (2026-10-30). The migration was applied to Supabase with `apply_migration` on 2026-10-30 (it is `job_posting_filters` in the migration history there, version `20261030061042`, not the timestamp of the file, as with `job_postings_insert`) and checked with SQL. **Nothing is committed or pushed.** The form was driven in a headless Chromium (Playwright) against the dev server as the test employer, and the screenshots were looked at. `npm test` (261 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. See [Verification](#verification) for what was and wasn't checked.

**Scope when asked to implement "the plan":** only this document. It builds on [post-job.md](./post-job.md) and [job-publishing.md](./job-publishing.md) (the job form, create and edit actions, insert and update grants), which are done.

## Context
An employer creating or editing a job (`/test/jobs/new`, `/test/jobs/{jobId}/edit`, `src/components/employer/job-editor.tsx`) can't yet say what a candidate must have. This adds **filters**: short criteria ("React", "5+ years", "English C1") typed as chips. Later, uploaded CVs are checked against them automatically, so the employer sees which candidates meet every required one. This step only **stores** them; no CV matching yet.

## Decisions (agreed with the user, 2026-10-30)
- **Two chip inputs: "Required filters" and "Nice-to-have filters"**, both the existing `ChipsInput` (`src/components/jobs/chips-input.tsx`) from the job board filter bar, same design: Enter (or comma) adds a chip and the box stays ready for the next; Backspace in an empty box removes the last; × removes one. Moving a filter between lists = remove and retype.
- **Private:** candidates never see them. Not in the candidate preview, and a later candidate-facing read of `job_postings` must leave these columns out (noted in security.md). Visible filters would just be copied into CVs as keywords.
- **"Meets all"** later means: every required filter matched. Nice-to-have ones only rank.
- **Optional:** a job can have none. Up to **20 filters in all**, each **1–100 characters** (ChipsInput's defaults), trimmed, unique case-insensitively across both lists.
- **Editing filters is always allowed**, like the rest of the job; the demo job stays uneditable.

### Data model: two `text[]` columns on `job_postings`, not a new table
`required_filters text[] not null default '{}'` and `optional_filters text[] not null default '{}'`.
- The filters are written and read **together with the job, from one form**. As columns they go in the same `insert`/`update` the actions already do: one atomic statement, covered by the existing insert/update policies and column grants. No new table, policies or RPC.
- A separate table would need two requests (the job could save without its filters, and a retry would duplicate the job) or moving create/edit into an RPC.
- "The job holds ids of filters" (an array of foreign keys) isn't enforced by Postgres; the relational form would be a filters table pointing at the job.
- Labels are unique per job, so they work as keys for later match results (e.g. `job_applications.matched_filters text[]`; "meets all" = `required_filters <@ matched_filters`).
- If filters later need more attributes (weight, type), moving them to a table is one migration with `unnest`.

## Plan

### 1. Migration `supabase/migrations/<timestamp>_job_posting_filters.sql`
House style: comment on top, explicit grants.
- `alter table public.job_postings add column required_filters text[] not null default '{}', add column optional_filters text[] not null default '{}'`. Existing rows (demo job) get empty lists; the deployed code keeps working.
- **`public.job_filters_valid(p_required text[], p_optional text[]) returns boolean`**, `language sql immutable`, `set search_path = ''`: one-dimensional (or empty), at most 20 elements in all, no null, each `= btrim(f)` and `char_length` 1–100, `count(distinct lower(f)) =` total. `revoke execute … from public, anon; grant … to authenticated` (check at verification that inserts still pass).
- `add constraint job_postings_filters_valid check (public.job_filters_valid(required_filters, optional_filters))`.
- `grant insert (required_filters, optional_filters), update (required_filters, optional_filters) on public.job_postings to authenticated`.

### 2. Schema: `src/lib/companies/job-posting.ts`
- `FILTERS_MAX = 20`, `FILTER_MAX = 100`.
- A `filterList`: array of `text` (the existing CRLF/trim transform), each ≤ `FILTER_MAX`, empties dropped, case-insensitive duplicates dropped (first kept).
- `jobPostingSchema` gains `requiredFilters` and `optionalFilters`, plus an object-level check: a filter in both lists → issue on `optionalFilters` ("“React” is already a required filter."); more than 20 in all → issue on `requiredFilters` ("Use at most 20 filters in all."). `z.flattenError` maps both to field errors.

### 3. Actions: `src/app/(employer)/[company]/actions.ts`
- New `listField(formData, name)`: `formData.getAll(name)`, strings only.
- A shared `jobPostingFields(formData)` builds the object both `createJobPosting` and `updateJobPosting` parse (removes the duplicated block).
- Insert and update add `required_filters` and `optional_filters`. Nothing else changes (checks order, limits, redirect).

### 4. Data: `src/lib/companies/workspace.ts`
- `CompanyJobDetails` and `JobDetailsRow` gain the two lists; `getCompanyJob()` selects `required_filters, optional_filters`. The dashboard list (`getCompanyJobs`) is unchanged.

### 5. Form: `src/components/employer/job-editor.tsx` + `ChipsInput`
- `ChipsInput`: optional `id`, `aria-invalid`, `aria-describedby`, passed to its inner `<input>` so `<Label htmlFor>` and `FieldError` work. The job board usage (`filter-rule.tsx`) is unchanged.
- `EditableJob` gains `requiredFilters`, `optionalFilters`; two `useState<string[]>` seeded from `job`.
- Under Location/Work mode: **Required filters** and **Nice-to-have filters** (`(optional)` like Location), each a `ChipsInput` with `maxLength={FILTER_MAX}`, `maxValues={FILTERS_MAX - other.length}`, placeholder "Type a filter, press Enter", one `<input type="hidden" name="requiredFilters|optionalFilters">` per chip, and a `FieldError`.
- A note under them: "Candidates don't see these. Their CVs will be checked against them. Up to 20 in all."
- Enter in a chip box calls `preventDefault`, so it never submits the form. Text typed but not entered is committed on blur, before the Save click submits.
- The candidate preview stays as it is (filters are private).

### 6. Tests (Vitest)
- `src/lib/companies/job-posting.test.ts`: missing → `[]`; trimmed; empties and case-insensitive duplicates dropped; 101 characters refused; 21 in all refused on `requiredFilters`; a filter in both lists refused on `optionalFilters`.
- `src/app/(employer)/[company]/actions.test.ts`: create inserts exactly seven columns with both lists from repeated form entries; update sets exactly six; the existing "five columns" / "four columns" tests updated.
- `src/lib/companies/workspace.test.ts`: `getCompanyJob` maps the lists.

### 7. Documentation
- New `features/job-filters.md` (this plan, with status and verification).
- `features/companies.md` ("Where this stands"), `project-overview/architecture.md` (columns, function, grants), `security.md` (filters private, column grants, check constraint, candidate reads must exclude these columns), `roadmap.md` (CV matching as the next step).

## Order of release
1. **The migration**, through Supabase MCP `apply_migration` after a go-ahead (or by hand in the SQL editor, as for job-publishing). Safe before the code: it only adds defaulted columns, a check and grants. The new code needs it (insert/select of unknown columns would fail).
2. **No commit or push** unless asked. The post-job and job-publishing work is still uncommitted in the tree.

## Files
- **New:** the migration; `features/job-filters.md`.
- **Changed:** `job-posting.ts` + test; `actions.ts` + test; `workspace.ts` + test; `job-editor.tsx`; `chips-input.tsx`; the docs in step 7.

## Verification
1. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` pass.
2. **On Supabase, with SQL:** the columns, check and function (`search_path = ''`) exist; `column_privileges` shows insert/update on the two columns for `authenticated`, nothing for `anon`. In a `DO` block ending with a deliberate `raise exception` (nothing kept), as `authenticated` with a real company owner's JWT: insert/update with filters passes; 21 filters, a 101-character one, a blank or untrimmed one, a null element, a 2-D array and "React"/"react" across lists each break the check; the demo job still updates 0 rows. Security advisors: nothing new.
3. **In a browser, as an employer:** on `/test/jobs/new` add filters with Enter in both boxes (the form isn't submitted), remove with × and Backspace, click Save with text still typed (it's kept) → open Edit and see both lists; the preview never shows them; a duplicate across lists shows the field error and keeps everything typed.

### Verification status (2026-10-30)
- **Step 1 done:** 261 tests, lint, `tsc` and the production build pass.
- **Step 2 done, on Supabase, after the migration `supabase/migrations/20261030160000_job_posting_filters.sql` was applied:**
  - Both columns are `text[] not null default '{}'`; the demo job has two empty lists. The check `job_postings_filters_valid` calls `public.job_filters_valid(text[], text[])`: `immutable`, not `security definer`, `search_path = ""`, `execute` for `authenticated` only.
  - `authenticated` has `insert`, `update` and `select` on both columns; `anon` has nothing on them.
  - In a `DO` block ending with a deliberate `raise exception` (nothing kept; afterwards no test row was left), as `authenticated` with the real owner's JWT: an insert with filters passes (so the function is executable from the constraint), and updates with two lists, both empty, 20 in all and a 100-character filter pass. 21 in all, 101 characters, a blank, an untrimmed (` x`), a null element, a 2-D array, "React"/"react" across lists and "a"/"A" in one list are each refused with `23514`. The demo job updates 0 rows, and the lists read back.
  - Security advisors: nothing new (the same three "Signed-In Users Can Execute SECURITY DEFINER Function" warnings for the existing RPCs, `rate_limits` without policies, and leaked-password protection off).
- **Step 3 done (headless Chromium via Playwright, signed in as the test employer, against `next dev`; 28 checks, no console errors):**
  - `/test/jobs/new`: Enter and comma add a chip and the page stays (the form is not submitted); × removes one; Backspace in an empty box removes the last; both boxes keep their own chips; the candidate preview never shows a filter.
  - Save with text still typed in the box (`TypeScript`, no Enter) keeps it. The dashboard job's Edit page shows both lists as saved, and no filter in the preview.
  - A filter in both lists ("React" required, "react" nice-to-have): the field error "“react” is already a required filter." appears under Nice-to-have only, the page stays, every chip and field is kept, the box has the red invalid border (seen in the screenshot), and `aria-invalid` and `aria-describedby` are set. Removing the duplicate and saving goes through, and the lists persist.
  - The two boxes stop at 20 filters in all (with 3 required, the nice-to-have box took 17). Leaving without saving changes nothing.
  - The test job was deleted from the dashboard afterwards (no row left; checked with SQL).
  - Not checked: mobile width, dark mode, a keyboard-only pass.

### Notes on the implementation
- Next 16 keeps the page you navigate away from in the DOM, hidden (`display: none`), so after a client-side navigation a selector such as `[aria-label="Candidate preview"]` can match two elements. A hard load has one. This is the framework's route caching, not something the form does; it only matters for a browser script.
- The edit and create page skeletons grew from `h-[34rem]` to `h-[44rem]` for the two extra fields.
- `ChipsInput` itself dedupes case-sensitively within its own box; the case-insensitive rule is the schema's, so "React" and "react" typed in one box are collapsed on save, and across the two boxes they show the field error.

## Out of scope
- Uploading and parsing CVs, matching them against filters, showing "meets all" on applicants.
- Filters on the dashboard card, the demo job's filters, suggestions/autocomplete from earlier jobs.
