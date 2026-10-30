# Feature: Editing, Publishing and Unpublishing a Job

**Status:** Implemented. The migration was applied to Supabase by hand in the SQL editor on 2026-10-30 (the `apply_migration` call was declined three times), so it isn't in the migration history there under a version of its own. It is checked with SQL and PostgREST, but **nothing is pushed to `main`** and the dashboard, the dialogs and the edit page have **not been looked at in a browser**. `npm test` (247 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. See [Verification](#verification) for what was checked and what was not.

A company can edit any of its jobs, and publish or unpublish it from its card on the dashboard. A new job is saved as a **draft** (unpublished). Publishing asks for confirmation. Unpublishing a job that has applicants asks what should happen to them: tell them the job is closed, move them to another job (for a duplicate posting), or keep them (a pause). The published state is stored, but **published jobs are not on the job board yet**; that comes later.

**Scope when asked to implement "the plan":** only this document. It builds on [post-job.md](./post-job.md) (the form saving a job, applied to Supabase but not yet committed) and [demo-job.md](./demo-job.md) (the dashboard cards, deleting a job).

## Already in place (nothing to redo)

- **The job form** `src/components/employer/job-editor.tsx` (title, description, location, work mode, candidate preview with Upload CV) and the action `createJobPosting` in `src/app/(employer)/[company]/actions.ts`.
- **The dashboard cards** `src/components/employer/job-card.tsx`, with the confirm-dialog pattern of `src/components/employer/delete-job-button.tsx` (pending state, error, Cancel takes the focus, `refresh()` on success).
- **The tables** `job_postings` and `job_applications` with their policies (`supabase/migrations/20261026210000_employer_jobs.sql`, `20261030120000_job_postings_insert.sql`), and the RPC `ensure_employer_workspace()`, whose employer check and `security definer` / `search_path = ''` style the new RPCs follow.
- **Pieces to reuse:**
  - `jobPostingSchema` and the limits in `src/lib/companies/job-posting.ts`;
  - `rateLimit` with `postgresStore`; `requireAccountType("employer")`;
  - `getCompanyOrNotFound` (`src/lib/companies/get-company.ts`) and the page pattern of `jobs/new/page.tsx` (params read inside Suspense);
  - the radio-card pattern in `src/components/auth/account-type-dialog.tsx` (native radios, `has-checked:` styles);
  - `AlertDialog`, `Select`, `Badge` from `src/components/ui/`.

## Decisions
- **A new job is a draft.** The form's button becomes **Save job**; publishing happens from the card. The insert grant doesn't include the new column, so a client can't create a published job.
- **The state is a timestamp, `job_postings.published_at`** (null = unpublished). One column says both whether and since when, which the job board will want for its "Posted" date.
- **Publishing:** a confirmation dialog, then `published_at = now()`. Nothing changes on `/jobs`.
- **Unpublishing a job with active applicants** opens a dialog with three choices (none preselected; the button stays disabled until one is picked):
  1. **Tell the applicants the job is closed.** Their applications get `withdrawn_at`. **No email is sent**: the only applicants today are the mock accounts. The candidate will see it later, in `/applications` or by email.
  2. **Move them to another job.** A select lists every other job of the company except the demo job, published or not. A candidate already on the target job isn't duplicated: their application there becomes active again. The emptied job stays as an unpublished draft; deleting it is still the Delete button.
  3. **Keep them** (a pause): the applications stay as they are.
- **Unpublishing with no active applicants:** a plain confirmation.
- **Withdrawn applications stay withdrawn** if the job is published again. The card counts active applicants, and withdrawn ones separately ("3 applicants · 2 withdrawn").
- **Editing is always allowed**, published or not, with applicants or not, at `/{company}/jobs/{jobId}/edit` with the same form.
- **The demo job** has no Edit and no Publish/Unpublish, and can't be a move target: it stays private, as [demo-job.md](./demo-job.md) decided. It keeps Delete.

## Plan

### 1. Database: a new migration `supabase/migrations/<timestamp>_job_publishing.sql`
- **Columns:**
  - `job_postings.published_at timestamptz` (null = unpublished). Existing rows, the demo job included, stay unpublished.
  - `job_applications.withdrawn_at timestamptz` (null = active).
- **Editing:** an update policy on `job_postings` for the company's owner and `not is_demo` (both `using` and `with check`), and `grant update (title, description, location_raw, work_mode)`. `published_at`, `is_demo` and `company_id` can't be updated by a client. The check constraints from `job_postings_insert.sql` apply to updates too.
- **RPC `publish_job_posting(p_job_id uuid) returns void`** (security definer, `search_path = ''`, execute for `authenticated` only):
  - refuses a JWT that isn't an employer's, as `ensure_employer_workspace()` does;
  - locks the job (`for update`) joined to a company owned by `auth.uid()`; none → `P0002` "Job not found"; a demo job → `42501`;
  - sets `published_at = now()` if it is null (publishing a published job changes nothing).
- **RPC `unpublish_job_posting(p_job_id uuid, p_applicants text, p_target_job_id uuid default null) returns integer`** (same security), all in one transaction:
  - the same employer, ownership and demo checks, and the job locked;
  - `p_applicants` must be `keep`, `withdraw` or `move` (else `22023`); the job must be published (else `55000` "This job is not published");
  - **withdraw:** `withdrawn_at = now()` on the job's active applications;
  - **move:** the target must be another non-demo job of the same company (else `22023`), also locked. For candidates already on the target, their target application is reactivated (`withdrawn_at = null`, the earlier `applied_at` kept) and the source one deleted; the remaining active applications get `job_posting_id = target`, so they keep their ids. Withdrawn applications stay on the source job;
  - **keep:** nothing;
  - then `published_at = null`. It returns how many active applications were withdrawn or moved.
- `revoke execute … from public, anon; grant execute … to authenticated` on both RPCs.

### 2. Data: `src/lib/companies/workspace.ts`
- `CompanyJob` gains `publishedAt: string | null` and `withdrawnCount`; `applicantCount` becomes the **active** count.
- `getCompanyJobs()` selects `published_at` and two aliased aggregate embeds, `active:job_applications(count)` filtered with `withdrawn_at is null` and `withdrawn:job_applications(count)` filtered with `not is null`. Checked against Supabase during implementation; if PostgREST doesn't filter an aggregate embed, fall back to embedding `job_applications(withdrawn_at)` and counting in code.
- **New `getCompanyJob(jobId)`**: null for a non-uuid id (no database error), else the job's `id, title, description, location_raw, work_mode, is_demo` through row level security (`maybeSingle`), mapped to camelCase.

### 3. Actions in `src/app/(employer)/[company]/actions.ts`
All follow the order of the existing actions: zod, `requireAccountType("employer")`, `rateLimit`, the user's own client.
- **`updateJobPosting(prev, formData)`** for `useActionState`: the job id comes from a hidden `jobId` input (a uuid, validated like the rest); `jobPostingSchema`; limit `edit-job:<userId>`, 60 an hour; `update` of the four columns `.eq("id", jobId).select("id")`, where no row means "Job not found." (another company's or the demo job); then `redirect` to the dashboard.
- **`publishJobPosting(jobId)`** and **`unpublishJobPosting({ jobId, applicants, targetJobId? })`**, called from the dialogs like `deleteJobPosting`, answering `{ ok: true } | { ok: false; error }`:
  - zod: uuids; `applicants` is `keep | withdraw | move`; `move` requires a `targetJobId` that differs from `jobId`;
  - one shared limit, `publish-job:<userId>`, 30 a minute;
  - the RPC, with its error codes mapped to messages: `P0002` "Job not found.", `55000` "This job is already unpublished.", `22023` "Choose another of your jobs to move the applicants to.", anything else "Could not save. Try again.";
  - `refresh()` on success.
- **`createJobPosting`** is unchanged: the job is a draft because `published_at` defaults to null.

### 4. The edit page: new `src/app/(employer)/[company]/jobs/[jobId]/edit/page.tsx`
- The same structure as `jobs/new/page.tsx`: a static heading "Edit job", metadata "Edit job | Callback", and inside Suspense `getCompanyOrNotFound(params)` → `connection()` → `requireAccountType("employer")` → `getCompanyJob(jobId)`. A missing job or the demo job → `notFound()`.
- No `generateStaticParams`: `jobId` is runtime data read inside Suspense, the documented pattern for Cache Components (`03-api-reference/03-file-conventions/dynamic-routes.md`, "With Cache Components").
- Proxy already protects it (`/test` is an employer prefix).

### 5. The form: `src/components/employer/job-editor.tsx`
- An optional `job` prop (id and the four values) fills the initial state, adds the hidden `jobId` input and uses `updateJobPosting`; without it, `createJobPosting` as now.
- Buttons: **Save job** for a new job, with the note "Saved as a draft. Publish it from the dashboard."; **Save changes** when editing. Both read "Saving…" while pending. Cancel stays.

### 6. The dashboard card: `src/components/employer/job-card.tsx`
- **Badges:** "Demo" as now; otherwise "Published" (the default lime badge) or "Draft" (outline).
- **Count:** "3 applicants", plus "· 2 withdrawn" when there are any.
- **Buttons** (not on the demo job): **Edit** (a link styled as an outline button) and **Publish** or **Unpublish**, next to Lets start (disabled with no active applicants). Delete stays in the header.
- `src/app/(employer)/[company]/page.tsx` passes each card its **move targets**: the other non-demo jobs from the list it already has (`id`, `title`, published or not), so the dialog needs no extra query.
- **New `src/components/employer/publish-job-button.tsx`** (client): a confirmation in the `DeleteJobButton` pattern. "Publish this job?" / "It will be marked as published. Candidates will see it once Callback jobs are on the job board." / **Yes, publish**.
- **New `src/components/employer/unpublish-job-button.tsx`** (client), same pattern:
  - no active applicants: "Unpublish this job?" / "It goes back to being a draft." / **Unpublish**;
  - with applicants: "Unpublish this job?" / "3 people applied. What should happen to their applications?", then the three radio cards (the `account-type-dialog.tsx` style). Choosing **Move** shows the `Select` of targets ("Published"/"Draft" next to each title); with no other job, that option is disabled with "You have no other job to move them to." The button stays disabled until a choice (and a target, for Move) is made.

### 7. Tests (Vitest)
- **`actions.test.ts`**, with `rpc` and `update` added to the mocked client:
  - `updateJobPosting`: a bad id or bad fields touch nothing; employer only; the limit; updates the four columns for that id; "Job not found." when no row changes; redirects to `/test`.
  - `publishJobPosting`: a non-uuid id; employer only; the shared limit; calls the RPC with the id; maps `P0002`; refreshes.
  - `unpublishJobPosting`: `move` without a target, or with the job itself, is refused before anything runs; passes `p_target_job_id: null` for keep and withdraw; maps `55000` and `22023`; refreshes.
- **New `src/lib/companies/workspace.test.ts`**: `getCompanyJobs` maps the two counts and `published_at`; `getCompanyJob` answers null for a non-uuid without querying.

### 8. Documentation
- This document, saved as `features/job-publishing.md`, with a status and verification.
- [post-job.md](./post-job.md): a new job is now a draft, and the button reads Save job.
- [architecture.md](../project-overview/architecture.md) (the two columns, the RPCs, the update grant), [security.md](../project-overview/security.md) (the update policy and column grant, the two `security definer` RPCs and their checks, the limits), [roadmap.md](../project-overview/roadmap.md), [companies.md](./companies.md) ("Where this stands").

## Order of release
The database is shared between local development and production.
1. **The migration** (done, see Status). It only adds nullable columns, a policy, a grant and two functions, so the code already deployed keeps working. The new code, on the other hand, needs it: before it was applied, the dashboard failed with `column job_applications_1.withdrawn_at does not exist`.
2. **Commits, and the push to `main`** (which deploys), only when asked. The [post-job.md](./post-job.md) work is still uncommitted; it can go in its own commit first.

## Files
- **New:**
  - `supabase/migrations/<timestamp>_job_publishing.sql`;
  - `src/app/(employer)/[company]/jobs/[jobId]/edit/page.tsx`;
  - `src/components/employer/publish-job-button.tsx`, `unpublish-job-button.tsx`;
  - `src/lib/companies/workspace.test.ts`; `features/job-publishing.md`.
- **Changed:**
  - `src/app/(employer)/[company]/actions.ts` and its test;
  - `src/lib/companies/workspace.ts`;
  - `src/components/employer/job-editor.tsx`, `job-card.tsx`;
  - `src/app/(employer)/[company]/page.tsx`;
  - the documentation in step 8.

## Verification
1. `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` (the build still prerenders `/test` and `/test/jobs/new`; the edit route has a static shell).
2. **After the migration, with SQL**, in a `DO` block that ends with a deliberate exception so nothing is kept (as in [post-job.md](./post-job.md)), as `authenticated` with a real company owner's JWT and the mock candidates as applicants:
   - publish sets `published_at`; publishing the demo job, another company's job, or as `anon`, is refused;
   - unpublish `keep` leaves the applications; `withdraw` sets `withdrawn_at` on the active ones only; `move` with one candidate already on the target leaves the source with no active applications, no duplicate on the target, and that candidate active there;
   - `move` to the job itself, to the demo job or to another company's job is refused; unpublishing an unpublished job is refused;
   - the owner can edit the title of their job; editing the demo job changes no row; updating `published_at`, `is_demo` or `company_id` is refused;
   - the security advisors: the two new RPCs are expected under "Signed-In Users Can Execute SECURITY DEFINER Function", like `ensure_employer_workspace()`; nothing else new.
3. **The aggregate embed** in `getCompanyJobs()`, through PostgREST with the secret key (read only): the active and withdrawn counts come back as `[{ count }]`.
4. **In a browser, as an employer:** save a job (it is a Draft) → Publish with its dialog → Unpublish with each of the three choices on a job with applicants (the demo job's applicants can't be used, so this needs applications made with SQL, or is checked only through step 2) → Edit, Save changes → the card shows the new title. Nothing appears on `/jobs`.

### Done
- **`npm test`** (247 tests, 26 of them new), **`npm run lint`**, `npx tsc --noEmit` and **`npm run build`** pass. The build prerenders `/test`, `/test/jobs/new` and the new `/test/jobs/[jobId]/edit` (static shell, `jobId` read inside Suspense).
  - `actions.test.ts`: `updateJobPosting` (bad id and fields touch nothing, employer only, 60 an hour, exactly four columns, a `company_id`, `is_demo` or `published_at` in the form is ignored, "Job not found.", database error), `publishJobPosting` and `unpublishJobPosting` (bad input refused before anything runs, employer only, the shared 30 a minute limit, the RPC arguments for keep, withdraw and move, the error codes mapped, no refresh on a failure).
  - `workspace.test.ts`: `getCompanyJobs` maps `published_at` and the two counts and filters each embed by `withdrawn_at`; `getCompanyJob` answers null for a non-uuid without querying, null when row level security hides the job, and maps the job.

### On Supabase (after applying the migration)
- **The schema:** `published_at` and `withdrawn_at` exist; `authenticated` has `update` on exactly `description, location_raw, title, work_mode` and `anon` on nothing; the "Companies can update their jobs" policy exists; both functions are `security definer` with an empty `search_path`, executable by `authenticated` and not by `anon`.
- **The security advisors** report exactly two new findings, the expected ones: `publish_job_posting` and `unpublish_job_posting` executable by signed-in users, like `ensure_employer_workspace()`. Nothing else changed.
- **The dashboard's select** (`getCompanyJobs()`, both filtered aggregate embeds), run with the secret key, read only: no error, and the counts come back as `[{ count }]` (the demo job: 3 active, 0 withdrawn; the other job: 0 and 0). It was **not** checked with a non-zero withdrawn count, since that needs a committed write; the filter on the `withdrawn` alias is the one untested path.
- **The functions and row level security**, in `DO` blocks that end with a deliberate `raise exception` so nothing is kept (a count afterwards showed the two original jobs, no leftovers, nothing published, none withdrawn), as `authenticated` with a JWT built from a real company owner's id and the mock candidates as applicants. Everything came out as intended:
  - **Publish:** a draft is published; a candidate-type JWT, a stranger and `anon` are refused (`42501`, `P0002`, permission denied).
  - **Unpublish, keep:** returns 0, the job is a draft again, its 3 applications stay active. Unpublishing a draft is refused (`55000`).
  - **Unpublish, withdraw:** returns 3, all 3 get `withdrawn_at` and stay on the job.
  - **Unpublish, move:** 3 applicants of one job go to another where one of them had a withdrawn application: the source is left with none, the target has 3, all active, no duplicate, and the two moved applications kept their ids. A second move leaves an already withdrawn application on the source job.
  - **Bad moves** (to itself, no target, to the demo job, to an unknown job, a bad `p_applicants`) are refused with `22023` and leave the job published.
  - **Two real companies:** the demo job can't be published, unpublished, moved to or edited (`42501`, `22023`, 0 rows); the other company's jobs answer `P0002` (publish, unpublish), `22023` (as a move target) and 0 rows (edit), and its job and applications stay untouched.
  - **Edit:** the owner edits their own job (1 row); setting `published_at`, `is_demo` or `company_id` is refused (`42501`); a blank title violates the check constraint (`23514`); a stranger changes 0 rows; `anon` is refused.

### Not done
- **The dialogs and the edit page in a browser**: the target `Select` inside the unpublish dialog (a Base UI select in a Base UI dialog), the Edit form's values, the Published/Draft badge and the withdrawn count on the card. Unpublishing a job with applicants can only be tried with applications made by hand; the demo job's can't be used.
- **The Server Actions against the real database**, as a signed-in employer. The tests mock Supabase; the functions and policies were checked with SQL, not through the actions.
- **Pushing to `main`**, and the deploy that follows.

## Out of scope
- Showing published jobs on `/jobs` and a job page for candidates.
- Sending the "job closed" notice (email or in-app); only `withdrawn_at` is stored.
- Moving applicants between companies, or one by one.
- Editing or publishing the demo job.
- History of edits or of publish changes.
