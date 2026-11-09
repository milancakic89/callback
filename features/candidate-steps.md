# Feature: Candidate Steps (company-defined statuses the candidate sees)

**Status:** Implemented in code on the branch `feature/candidate-steps`, 2026-11-09, and checked in a browser and against the database. `npm test` (79 files, 813 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. The migration `20261109180000_candidate_steps.sql` is applied (by the user, by hand in the SQL editor, after every MCP attempt was declined, so it has no version of its own in the migration history). **One bug found by the browser run and fixed in a second migration, `20261109181000_candidate_steps_deferred_fk.sql`** (deleting an account whose application was on a step failed), applied by the user by hand and checked. See [Verification](#verification). Not committed, not pushed.

**Scope when asked to implement "the plan":** only this document. It replaces the fixed statuses of [application-status.md](./application-status.md). It builds on [candidate-cvs.md](./candidate-cvs.md), which already shows the candidate their applications in `/applications`.

The branch `feature/candidate-steps` was made from `feature/landing-screenshots`, so that branch's uncommitted changes are in the same working tree.

## Where the code differs from the plan
- **"Apply statuses" is on its own row under the heart and Next,** not beside them: the column is 17rem wide and the three would not fit. It is the `applyButton` slot of `ReviewActions` (`ats-panel.tsx`), in the desktop column and in the phone bar alike.
- **`saveCandidateSteps` answers the saved list** (`steps` in `CandidateStepsFormState`), and the form starts again from it. Without it a new step has no id, and saving twice would add it twice.
- **The state moves are in `src/lib/review/pending-stages.ts`** (`withStage`, `revertStage`, `pendingStageChanges`, `withApplied`), and `src/components/review/use-stage-changes.ts` only wires them to the two actions. Static markup can't click, so the logic is where it can be tested.
- **A new `src/lib/applications/candidate-status.ts`** decides how a status reads to the candidate (the label, the text, and whether the step was edited after the candidate was moved to it), so the component has nothing to decide.
- **Names:** `StageControl` and `StageDot` are in `stage-control.tsx`; the settings row is `CandidateStepFields` in `candidate-step-row.tsx`; the list helpers' payload type is `StepInput`. `StageFilter` is a string (`"any"` or a status key from `stageChoiceKey`).
- **In the database,** names are unique through a generated `name_key` (`lower(name)`) with deferrable unique constraints, so a reorder or a swap of names can pass through a clash inside `save_company_steps`; the reserved names (Applied, Offer, Got offer, Rejected) are checked there too, not only by zod. `save_company_steps` ends with `set constraints … immediate`, so a clash is an error of that call.
- **A change back to Applied that the candidate hasn't been shown** still counts as pending and is marked "Not applied" in the playlist.
- **The landing screenshot script** needs the account to have steps named "Screening" and "Interview" in Settings (a note at the top of `scripts/capture-landing-screenshots.ts`). The landing copy is unchanged.
- **A second migration, `20261109181000_candidate_steps_deferred_fk.sql`,** makes the two foreign keys from `job_applications` to `company_steps` `deferrable initially deferred`. Found by the browser run: with the default check at the end of each statement, deleting an account whose application was on a step failed ("Database error deleting user"), because the steps go in the cascade before the jobs' applications that point to them. Deferred to the end of the transaction, the check finds none left. A step still can't be deleted while an application points to it.
- **Migration B** (`20261109190000_drop_hiring_stage.sql`) is not written yet. It is written after the deploy, so nobody applies it early.

## Context
Today every company uses the same six fixed statuses: Applied, Screening, Interview, Offer, Hired and Rejected (`hiring_stage` enum, `src/lib/review/stages.ts`). The candidate is never told any of them, because `my_job_applications()` deliberately returns none of the company's marks.

Companies run different processes. Each company now defines its own steps between **Applied** and **Offer**, up to 10 of them, and each step has a text for the candidate. On the review screen the employer sets statuses as today, then sends them all at once with **Apply statuses**. Only then does the candidate see the new status in `/applications`, with an info icon that shows the company's text.

## Decisions (agreed with the user, 2026-11-09)
- **The pipeline:** Applied → [up to 10 company steps, in the company's order] → Offer, plus **Rejected**, which can be set at any point. **Hired is dropped.** Any status can still change to any other.
- **Steps belong to the company,** not to a job. They are managed on a new page, `/{slug}/settings` ("Candidate steps"), and every job of the company uses them.
- **Each step has a name and a text for the candidate.** The name is 1–60 characters. The text is 1–500 characters, is required, and tells the candidate what this step means and what comes next. Names are unique within the company, ignoring case, and can't be "Applied", "Offer" or "Rejected".
- **Applied, Offer and Rejected have no company text.** The candidate sees only their name, with no info icon. The candidate's label for Offer is "Got offer", as in their own tracker. The employer's label stays "Offer".
- **Job editor:** when the company has no steps yet, `/jobs/new` and the edit page show an **"Add candidate steps"** button that links to `/{slug}/settings`. When it has steps, the editor shows one read-only line instead: "Candidate steps: Applied → Screening → Interview → Offer · Edit".
- **Apply statuses works per job, in one batch.** A status change is saved at once, as today, but only the employer sees it, and it is marked "Not applied". The **Apply statuses (N)** button sits next to Next. It opens a confirm modal that lists every pending change ("Ana Novak: Applied → Interview"). After Confirm, those candidates see their new status and the step's text.
- **Renaming:** the name, the text and the order can always be changed. A candidate always sees the step's current name and text. If either changed after the status was applied to them, the info popover adds "Updated on {date}".
- **Deleting:** a saved step can be deleted only if no application has *ever* been on it. A step that has been used can only be renamed or reworded. A new row that hasn't been saved can always be removed.
- **Keys on the review screen:** `A` Applied, `1`–`9` and `0` for steps 1–10, `O` Offer, `R` Rejected, `L` like (unchanged).
- **No email is sent.** The candidate sees the status only in `/applications`. Emails remain their own feature.

## The screens
- **`/{slug}/settings` (employer, new sidebar item "Settings" with lucide `SettingsIcon`):**
  - A "Candidate steps" card. The first row is "Applied" (locked: "Every application starts here"). Then come the editable step rows: a Name input, a "What the candidate sees" textarea with a character count, and ↑/↓ buttons. A row is removable only while it is unsaved or `usedAt` is null; a used row shows a lock with the tooltip "An application has been on this step, so it can't be deleted. Rename it instead." After the steps come the locked "Offer" and "Rejected (can be set at any step)" rows.
  - "Add step" is disabled at 10 and shows "N of 10 steps".
  - Save, a "Saved" note, and field errors per row, as on the profile form.
  - A hint: "Candidates see a step only after you apply statuses on the review screen. Renaming a step or changing its text updates it for every candidate already on it."
- **Review screen (`/{slug}/jobs/{id}/review`):**
  - **StageControl** lists Applied, the steps, Offer and Rejected, each with its key. On desktop it is a two-column grid. The phone bottom bar keeps its 3×2 grid while there are at most 6 choices, and uses a Select beyond that.
  - **The Apply statuses (N) button** sits beside the heart and Next, on desktop and in the phone bottom bar. It is disabled when nothing is pending.
  - **The confirm modal** is an `AlertDialog` titled "Apply N statuses?". It lists each change and says: "These candidates will see their new status in their application on Callback, with the text you wrote for that step. No email is sent." It offers Cancel and "Apply statuses", stays open while saving, and shows errors inline (`role="alert"`). It carries `data-landing className="dark"`.
  - **Playlist:** a row with a pending change shows a small "Not applied" marker. The status filter lists Applied, the steps, Offer and Rejected, with counts.
  - **The note under the control** changes from "Changing a status doesn't tell the candidate yet." to "Candidates see a new status only after you apply statuses."
- **`/applications`, "Applied on Callback" (candidate):** each active or paused application shows its status. A company step also gets an `InfoIcon` button, which opens a **Popover** (it works on tap, unlike a tooltip) with the step's text and, if the step was edited after the status was applied, "Updated on {date}". A withdrawn application shows no status.

## Plan

### 1. Migration A: `supabase/migrations/20261109180000_candidate_steps.sql` (additive; the deployed code keeps working)
- **`public.company_steps`:**
  - columns: `id uuid pk default gen_random_uuid()`, `company_id uuid not null references companies on delete cascade`, `position smallint not null check (position between 1 and 10)`, `name text`, `description text`, `used_at timestamptz` (null until an application is first put on the step), `created_at`, `updated_at`;
  - checks that name and text are trimmed and within their lengths;
  - `unique (company_id, position) deferrable initially immediate`, plus a unique index on `(company_id, lower(name))`;
  - RLS: owners can select ("company owner = auth.uid()"). Clients get no insert, update or delete grants: writes go only through the RPC below.
- **`create type public.pipeline_stage as enum ('APPLIED', 'STEP', 'OFFER', 'REJECTED')`.** It is a new type, so the old `hiring_stage` and the old `stage` column stay untouched for the deployed code.
- **New columns on `job_applications`:**
  - `pipeline_stage pipeline_stage not null default 'APPLIED'` and `step_id uuid references company_steps(id)`: what the employer chose;
  - `candidate_stage pipeline_stage not null default 'APPLIED'`, `candidate_step_id uuid references company_steps(id)` and `candidate_stage_at timestamptz`: what the candidate sees;
  - both foreign keys use NO ACTION, so the database refuses to delete a step that an application points to;
  - checks: `(pipeline_stage = 'STEP') = (step_id is not null)`, and the same for the candidate pair;
  - `grant update (pipeline_stage, step_id) on job_applications to authenticated`. The existing update policy already limits it to the owner and active applications. `stage_changed_at` is already granted. The `candidate_*` columns get no grant.
- **A trigger** `before insert or update of step_id, candidate_step_id, job_posting_id`, using a `security definer` function with `search_path = ''`:
  - it raises an error if a step belongs to a different company than the job;
  - it sets `company_steps.used_at = coalesce(used_at, now())` for the step;
  - a move by `unpublish_job_posting` stays within one company, so it stays valid.
- **Backfill:**
  - `HIRED` → `OFFER`, and `APPLIED`, `OFFER` and `REJECTED` copy across;
  - for each company that has applications on `SCREENING` or `INTERVIEW`, insert the steps "Screening" (and "Interview" where used), with a default text, then point those applications at them;
  - the candidate columns stay at `APPLIED` (nobody was ever told), so these changes show up as pending;
  - checked 2026-11-09: 3 applications are on `SCREENING`, in 2 companies, and one of them is a demo job.
- **RPC `save_company_steps(p_steps jsonb) returns setof company_steps`** (`security definer`, `search_path = ''`, granted to `authenticated`):
  - it works on the caller's own company and refuses more than 10 steps, an id from another company, and a duplicate or reserved name;
  - a saved step missing from the payload is deleted when `used_at is null`, and otherwise the RPC raises `step_in_use` with the step's name;
  - it sets the constraints deferred, rewrites positions as 1..n, updates `updated_at` only when the name or text changed, and inserts the new rows.
- **RPC `apply_application_stages(p_job_id uuid, p_changes jsonb) returns setof uuid`** (`security definer`, granted to `authenticated`):
  - `p_changes` is `[{id, stage, step_id}]`, exactly what the modal showed;
  - it checks that the caller owns the job;
  - for active applications on that job whose current `pipeline_stage`/`step_id` still equal the given values, it copies them into the `candidate_*` columns with `candidate_stage_at = now()`, and returns the ids it applied;
  - a change made in another tab after the modal opened is therefore never sent unseen.
- **`my_job_applications()`:** drop it and create it again, as `company_profiles.sql` did, adding `stage` (`candidate_stage`), `step_name`, `step_description`, `stage_at` (`candidate_stage_at`) and `step_updated_at`. The deployed code ignores the extra columns.

### 2. Shared logic, in pure tested modules
- **Rewrite `src/lib/review/stages.ts`:**
  - `PIPELINE_STAGES` and `PipelineStage`;
  - `CandidateStep = { id, position, name, description, usedAt, updatedAt }`;
  - `MAX_CANDIDATE_STEPS = 10`;
  - `StageChoice = { stage, stepId }`, with `stageChoiceKey()`, `sameChoice()`, `pipelineChoices(steps)` (in order, with label and key) and `choiceForKey(choices, key)`;
  - `employerStageLabel()` and `candidateStageLabel()` (Offer becomes "Got offer").
- **New `src/lib/review/pending-stages.ts`:** `pendingStageChanges(applicants)` returns the active applicants whose employer choice differs from what the candidate sees, as `{ id, name, from, to }`.
- **New `src/lib/companies/candidate-steps.ts`:**
  - the zod `candidateStepsSchema`, built with the existing `text`/`tooLong` helpers in `src/lib/validation/text-fields.ts`;
  - the limits;
  - the list operations used by the editor: `addStep`, `moveStep` and `removeStep`, where removal refuses a used saved step;
  - `settingsPath(slug)`;
  - `STEPS_SAVED_MESSAGE` (a `"use server"` file may only export functions).
- **`src/lib/review/navigation.ts`:** `StageFilter` becomes `string | "any"` (a choice key), and `matchesPlaylist` compares with `stageChoiceKey`.

### 3. Data
- **New `src/lib/companies/candidate-steps-queries.ts`** (`server-only`): `getCandidateSteps()` reads `company_steps` through `createClient()` ordered by `position`. RLS limits it to the employer's own company. It isn't cached, as `getJobApplicants` isn't.
- **`src/lib/companies/workspace.ts`:** `getJobApplicants` selects `pipeline_stage, step_id, candidate_stage, candidate_step_id` in place of `stage`. `JobApplicant` gets `stage: StageChoice` and `candidateStage: StageChoice`.
- **`src/lib/cvs/queries.ts` and `src/lib/cvs/types.ts`:** `CallbackApplication` gets `status: { stage, stepName, stepDescription, stageAt, stepUpdatedAt } | null`, which is null when withdrawn.

### 4. Server actions
- **New `src/app/(employer)/[company]/(workspace)/settings/actions.ts`, `saveCandidateSteps(prev, formData)`.** It follows the order of `profile/actions.ts`:
  1. read the steps from a hidden JSON field and run `candidateStepsSchema.safeParse`;
  2. `requireAccountType("employer")`;
  3. rate limit `candidate-steps:${user.id}`, 30 an hour;
  4. call `rpc("save_company_steps")`, mapping `step_in_use` to "“{name}” has been used, so it can't be deleted. Rename it instead.";
  5. return `{ message: STEPS_SAVED_MESSAGE }`.
- **`setApplicationStage(id, choice)` in `[company]/actions.ts`:** zod `{ stage: z.enum(PIPELINE_STAGES), stepId: uuid | null }`, refined so that `stepId` is set exactly when the stage is `STEP`. It then goes through the shared `setReviewMark`, which writes `pipeline_stage`, `step_id` and `stage_changed_at`.
- **New `applyApplicationStages(jobId, changes)` in the same file:**
  - zod: a uuid job id, and 1–500 changes;
  - employer only, rate limit `apply-stages:${user.id}` at 30 a minute;
  - call the RPC and return `{ ok, appliedIds }`;
  - no refresh: the screen updates its own state.

### 5. UI
- **Settings:**
  - new `src/app/(employer)/[company]/(workspace)/settings/page.tsx`, following `profile/page.tsx`: a static heading, then a Suspense boundary around `getCompanyOrNotFound` → `connection()` → `requireAccountType` → `getCandidateSteps()` → the editor, with a skeleton;
  - new `src/components/employer/candidate-steps-editor.tsx` (client: state, `useActionState`, add/move/remove through the lib functions, `FormAlert`/`FieldError`);
  - new `src/components/employer/candidate-step-row.tsx` (one row), which keeps the editor under 300 lines;
  - add `{ href: /${slug}/settings, label: "Settings", icon: SettingsIcon }` to `src/components/dashboard/sidebar-nav.tsx`. The `settings` slug is already reserved, and the route is nested, so no route list changes.
- **Job editor:**
  - new `src/components/employer/candidate-steps-notice.tsx`: the "Add candidate steps" button when there are no steps, otherwise the read-only line;
  - `JobEditor` gets `candidateSteps` and shows the notice at the top of the form;
  - `jobs/new/page.tsx` and `jobs/[jobId]/edit/page.tsx` load the steps with `getCandidateSteps()`.
- **Review:**
  - move `StageControl` and `StageDot` out of `ats-panel.tsx` (297 lines) into a new `src/components/review/stage-control.tsx`, and make them take `choices`;
  - new `src/components/review/apply-stages-button.tsx`: the button and the confirm `AlertDialog`, following `src/components/employer/publish-job-button.tsx`;
  - `ReviewActions` gets an `applyButton` slot (a ReactNode prop), so it doesn't depend on the dialog;
  - move the stage state (optimistic change, pending list, apply) out of `applicant-review.tsx` (683 lines) into a new hook, `src/components/review/use-stage-changes.ts`, so the screen shrinks instead of growing;
  - in the key handler, add `[role='alertdialog']` to the selector of ignored focus, and map keys through `choiceForKey`;
  - `candidate-playlist.tsx` gets the "Not applied" marker and the filter options from `choices`;
  - `review/page.tsx` loads the steps and passes them in.
- **Candidate:** new `src/components/applications/candidate-stage.tsx`, with the label, plus `InfoIcon` and a `Popover` for a step (dates with `formatAbsolute(..., "UTC")`, never `Date.now()`). It is used in `callback-applications.tsx`.
- **Landing fixtures:** `scripts/capture-landing-screenshots.ts` clicks "Screening" and "Interview" by name. Give the fixture used by the dev page (`src/app/dev/documents/page.tsx` and `review-shots.ts`) steps with those names, so the screenshots still work. The landing copy stays as it is.

### 6. Tests (Vitest, `*.test.ts` next to the file, `renderToStaticMarkup` for components)
- **New tests:**
  - `stages.ts` (choices, keys A/1–0/O/R, labels), `pending-stages.ts` and `candidate-steps.ts` (schema, limits, duplicate and reserved names, add/move/remove, a used step refused);
  - `settings/actions.ts` (refused before auth, employer only, the RPC payload, `step_in_use`, a database error, the limit at 30 versus 31);
  - `applyApplicationStages` and the new `setApplicationStage` shape;
  - `getCandidateSteps`, the new `getJobApplicants` and `my_job_applications` mapping;
  - each new or moved component: `candidate-steps-editor`, `candidate-step-row`, `candidate-steps-notice`, `stage-control`, `apply-stages-button`, `candidate-stage`.
- **Existing tests that change because the behaviour they test is removed** (not to make them pass):
  - `src/lib/review/stages.test.ts` (keys 1–5, Hired);
  - the stage literals in `navigation.test.ts`;
  - the `setApplicationStage` block in `[company]/actions.test.ts`;
  - the `stage` mapping in `workspace.test.ts`.

  This list goes into the feature doc. Every other existing test stays as it is and must pass.

### 7. Documentation
- Update `features/application-status.md`, which this replaces in part. Also update `project-overview/roadmap.md`, `architecture.md`, `security.md` (the new RPCs, grants and rate limits) and `testing.md`.
- In `features/landing.md`, note that the dashboard's "Your application status updates automatically" is now true.

## Verification

### Done
- `npm test` (79 files, 813 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass.
- **Existing tests changed because the behaviour they pin is gone,** not to make them pass: `stages.test.ts` (the fixed statuses and keys 1–5 and R), the `matchesPlaylist` block of `navigation.test.ts` (a status is now a choice with a step id), the `setApplicationStage` block of `[company]/actions.test.ts` (new input and columns), and the stage mapping in `workspace.test.ts`. Every other existing test is untouched and passes.
- **New tests:** `stages`, `pending-stages`, `candidate-steps`, `candidate-status`, `candidate-steps-queries`, `cvs/queries`, `settings/actions`, `applyApplicationStages`, and the components `stage-control`, `apply-stages-button`, `candidate-playlist`, `ats-panel`, `candidate-stage`, `callback-applications`, `candidate-steps-notice`, `candidate-step-row`, `candidate-steps-editor` and `job-editor`.
- **Breaking the code on purpose** turned the suite red each time: a used step made removable (1 test), the candidate shown the old status instead of the sent one (2), an edit at the same instant counted as edited (2), a step with no id accepted as a valid choice (1), and the 500-change limit removed (1). The originals were put back.
- **The migration** was applied by the user by hand and ran without an error. Read-only queries afterwards: `company_steps` has RLS on, one policy and only `SELECT` for `authenticated`; `authenticated` can update `pipeline_stage` and `step_id` and no `candidate_*` column; the new functions are executable by `authenticated` and not by `anon`; the backfill made one "Screening" step for each of the two companies that had applications on Screening and put the 3 applications on it, with the candidate columns still at Applied. The security advisors show nothing new beyond the "SECURITY DEFINER executable by signed-in users" warning the other RPCs have.
- **A throwaway employer, second employer and candidate** (`@example.com`, made with the secret key, deleted afterwards with their rate-limit counters; the database was back to its earlier counts, apart from changes the user made meanwhile), against the production build (`next start`, port 3100) and the real database, in headless Chromium. 68 checks passed:
  - the job editor offers "Add candidate steps" with none, and shows "Applied → … → Offer" once there are some; Settings is in the sidebar and highlighted;
  - settings: a reserved name and a name used twice are refused with their messages, 4 steps save and survive a reload, the up and down buttons swap rows, a used step can't be removed (with the reason) and an unused one can;
  - the review screen: Applied, 4 steps, Offer and Rejected with the keys A 1 2 3 4 O R; key 1 chooses the step and saves it while the candidate still sees Applied; the step is marked used; "Not applied" in the playlist; Apply statuses (1); the modal lists the change and says no email is sent; keys inside the modal change nothing; Cancel sends nothing; Confirm shows the candidate the step and clears the marker; the phone bar is a select with 7 choices, with Apply statuses on screen;
  - the candidate's `/applications`: the step name, the info icon opening the company's text, no "Updated on" at first; after the company renames the step, the new name and text and "Updated on"; Rejected without an info icon;
  - no horizontal overflow at 1920, 1280, 1100 and 390;
  - the database as real users (JWTs): deleting a used step, and all steps, is refused with `step_in_use` and the step's name; 11 steps, a duplicate name (any case), a reserved name and an empty text are refused; another company's step id is refused; a reorder, a swap of two names and removing an unused step go through; the employer can't write `candidate_stage` (`42501`), can't put another company's step on an application (`23514`) or a STEP without one (`23514`); applying a stale expectation updates nothing, and neither does another employer or the candidate applying on this job; another employer and the candidate read none of the steps; the candidate can't change the employer's status or save steps; `my_job_applications()` shows the applied status; `anon` is refused on all three functions and on the table (`42501`).
- **The first browser run failed two checks that were the test's, not the code's:** keys pressed the instant the modal appeared, before focus had moved into it, reached the screen behind. With a wait for the focus they pass. (In use, focus is in the modal within a frame.)

### Found by the checks
- **Deleting an account whose application is on a step failed** ("Database error deleting user"), twice. Cause and fix: see [Where the code differs](#where-the-code-differs-from-the-plan), `20261109181000_candidate_steps_deferred_fk.sql`. When no application pointed to a step, the same deletion worked.
- **The dev server on port 3000 served old code for `/applications`** (no status next to the state) until restarted, probably because `next build` ran in the same folder while it was running. The production build showed it correctly. Restart `npm run dev`.
- **The one console message,** `net::ERR_SSL_PROTOCOL_ERROR`, comes from the production CSP's `upgrade-insecure-requests` when the production build is opened over plain `http://localhost`. It is not from this feature.

### The fix, checked
- `20261109181000_candidate_steps_deferred_fk.sql` was applied by the user by hand. Read back: both foreign keys are `deferrable initially deferred`. Then, with a throwaway employer whose application was on a step (chosen and applied): the step can't be deleted on its own (`23503`), and deleting the employer's account first works. The throwaway accounts were deleted and nothing of theirs is left.

### To do
- Safari and Firefox, a real touch device, and a screen reader pass.

## Order of release (the database is shared between development and production)
1. **Migration A** (done), before the browser checks. It is additive, so the code already deployed keeps writing the old `stage` column. Changes made in production between A and the deploy aren't copied to `pipeline_stage`: a known, short gap.
2. **The fix migration, `20261109181000_candidate_steps_deferred_fk.sql`** (done), before the deploy. It only changes how two foreign keys are checked, so the deployed code is not affected.
3. **Commit, then push to `main`** (which deploys), only when the user asks.
4. **Migration B, `20261109190000_drop_hiring_stage.sql`, after the deploy:** drop `job_applications.stage` and the `hiring_stage` type. No SQL function references `stage` (checked with grep).

## Out of scope
- Emails to the candidate, and templates.
- Ending document access when a Rejected status is applied.
- A history of status changes.
- Texts for Applied, Offer and Rejected.
- Steps per job.
- Changing the landing copy.
