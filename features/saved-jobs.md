# Feature: Saved Jobs

**Status:** Implemented. The migration was applied with the Supabase MCP on 2026-10-25. Typecheck, lint and `npm run build` pass; the policies and grants were checked against the database. The UI has not been clicked through signed in, so the heart toggle, the `/saved-jobs` flow and the cross-page sync are untested.

A heart toggle per row on `/dashboard` saves a job, and a new `/saved-jobs` page lists the saved jobs in the same table as the dashboard.

## Context

The dashboard ([dashboard.md](./dashboard.md)) lists all active jobs, and Applied ([applied.md](./applied.md)) tracks the jobs a user applied to. There is no way to bookmark a job you are interested in but not ready to apply to.

### Decisions
- **New "Save job" column on `/dashboard`**, right after Applied and before Actions.
  - It holds only a heart icon: an outline heart when the job isn't saved, a filled heart when it is. It works like a checkbox.
  - It toggles both ways and saves immediately, with an optimistic update. There is no confirmation dialog.
  - Signed-in only, like Applied. On the public `/` the column doesn't exist at all.
- **New sidebar link "Saved jobs"** opens `/saved-jobs`.
- **`/saved-jobs` is the dashboard explorer, scoped to saved jobs.** It has the same columns (Label, Location, Company, Source, Posted, Work mode, Applied, Save job, Actions), plus search, filters, sort, paging and the Eye description sheet.
  - Unticking the heart removes the row right away. If saving fails, the row comes back with the error in a tooltip.
- **Saved and Applied are independent.** Applying doesn't unsave a job, and you can apply from `/saved-jobs` (same confirm dialog as on the dashboard).
- **Expired saved jobs stay listed.** A job the scraper has taken down (`active = false`) shows as a gray row, the same style as `/applications`.
  - In the **Applied column**, an "Expired" badge replaces the checkbox, because you can no longer apply to the job.
  - If you had already applied, the cell shows the checked, disabled checkbox and the "Expired" badge.
  - The heart still works, so an expired job can be unsaved.
  - If the job becomes active again, the row goes back to normal.
- **No "Saved" filter rule** in the filter bar.

### Constraints found in the code and docs
- **RLS on `public.jobs` only allows reading active rows**, except for the "Users can read jobs they applied to" policy (`supabase/migrations/20261023100000_applications_status.sql`). Showing expired saved jobs needs a matching "jobs they saved" policy.
- **The dashboard's `getActiveJobs()` is cached, anon-only, and active-only**, so it can't feed `/saved-jobs` (expired rows are missing). That page needs its own per-user query through the session client.
- **Cache Components keeps pages mounted across navigations** (React `<Activity>`, see `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`). `JobsExplorer` initializes `appliedIds` once from props (`useState(() => new Set(initialAppliedIds))`). Without a fix, a job unsaved on `/saved-jobs` would still show a filled heart back on `/dashboard`. The same is true of a job applied to from `/saved-jobs`, now that applying works on two pages.
- **Descriptions only exist for active jobs** (`getJobDescriptions()` filters `active = true`). For an expired saved job the Eye sheet shows "No description available." and Description filter rules treat it as having no description. That's acceptable for jobs that no longer exist.

## Data model

New migration `supabase/migrations/<timestamp>_saved_jobs.sql`, following `20261022125501_dashboard_applications.sql`:

```sql
-- One row per (user, job) the user saved (features/saved-jobs.md). Toggles both ways.
create table public.saved_jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null references public.jobs (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.saved_jobs enable row level security;

create policy "Users can read their saved jobs" on public.saved_jobs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users can save a job" on public.saved_jobs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users can unsave a job" on public.saved_jobs
  for delete to authenticated using (user_id = (select auth.uid()));

-- RLS does not cover TRUNCATE, so drop every privilege except the three granted below.
revoke all on public.saved_jobs from anon, authenticated;
grant select, insert, delete on public.saved_jobs to authenticated;

-- /saved-jobs keeps showing jobs the scraper has marked inactive. Permissive, so OR'd with
-- "Active jobs are public": anon still sees only active jobs.
create policy "Users can read jobs they saved" on public.jobs
  for select to authenticated
  using (exists (
    select 1 from public.saved_jobs s
    where s.job_id = jobs.id and s.user_id = (select auth.uid())
  ));
```

- The `(user_id, job_id)` primary key serves both the per-user ID lookup and the `exists` check.
- Apply it with the Supabase MCP `apply_migration`, so it is recorded in the migration history (unlike [applied.md](./applied.md), which was run by hand).

## Implementation Steps

### 1. Migration
- Add the file above and apply it. Afterwards, check with `list_tables` and `get_advisors`. A "multiple permissive policies" warning on `jobs` is expected, as it already is for applications.

### 2. Types and queries
- **`src/lib/jobs/types.ts`**: `JobListItem` gains `active: boolean`. The dashboard's rows are always `true`. Expired styling reads this field.
- **`src/lib/jobs/queries.ts`**:
  - `JobRow` and `toListItem()` gain `active`. `getActiveJobs()` adds `active` to its select.
  - `getSavedJobIds(userId)`: a copy of `getAppliedJobIds()` that reads `saved_jobs`. Used by `/dashboard`.
  - `getSavedJobs(userId)`: session client, not cached. It runs `from("saved_jobs").select("job:jobs(id, title, company_name, location_raw, department, work_mode, posted_at, first_seen_at, url, source, active)").eq("user_id", userId)`, maps each `job` with `toListItem()` and drops rows whose `job` is `null`. With the new policy in place that shouldn't happen, and `on delete cascade` removes the saved row when a job is deleted.

### 3. Server Action: `setSaved(jobId, saved)` in `src/app/(app)/dashboard/actions.ts`
- It goes next to `markApplied`, because both pages call it through `JobsExplorer`.
- Same structure as `markApplied`:
  - zod: `jobId` is a non-empty string of at most 300 characters, `saved` is a boolean.
  - `requireUser()`
  - `rateLimit` at 60 per minute, key `saved:<userId>`, using `postgresStore`
- If `saved`: `upsert({ user_id, job_id }, { onConflict: "user_id,job_id", ignoreDuplicates: true })`. Otherwise: `delete().eq("user_id", …).eq("job_id", …)`.
- Returns `{ ok: true } | { ok: false; error: string }`.

### 4. UI components (`src/components/jobs/`)
- **`save-job-button.tsx`** (new), modeled on `applied-checkbox.tsx`:
  - A ghost `icon-sm` `Button` with lucide `HeartIcon`. When saved, the heart is filled (`fill-current`, rose color).
  - `aria-pressed={saved}`, with `aria-label` "Save "<title>"" or "Remove "<title>" from saved".
  - Disabled while that row is saving. On error it gets a red outline and the error in a `Tooltip`, the same as `AppliedCheckbox`.
- **`table-parts.tsx`**: move `EXPIRED_ROW_CLASS` here from `applications-table.tsx` and import it in both tables.
- **`jobs-table.tsx`**:
  - New props: `showSaved`, `savedIds`, `pendingSavedIds`, `savedErrors`, `onToggleSaved(job, next)`, and an optional `emptyState` node.
  - A "Save job" header and cell after Applied. `colSpan` becomes `7 + showApplied + showSaved`.
  - A row with `!job.active` uses `EXPIRED_ROW_CLASS`. Its Applied cell shows `<Badge variant="outline">Expired</Badge>`, or the checked, disabled checkbox plus the badge when already applied.
  - `emptyState` replaces "No jobs match / Clear filters" when the list has no jobs at all, not just no matches.
- **`jobs-explorer.tsx`**:
  - New props: `showSaved`, `initialSavedIds`, `savedOnly`.
  - New state: `savedIds`, `pendingSavedIds` (a Set, because several hearts can be saving at once), `savedErrors`.
  - `handleToggleSaved(job, next)`: an optimistic add or remove, then `setSaved`, reverting and recording the error on failure. Same shape as `handleApply`.
  - **`savedOnly`** (the `/saved-jobs` mode) keeps only the jobs in `savedIds` before search and filters run. Unsaving drops the row immediately, and a failure brings it back. `totalCount` counts the saved jobs. With no saved jobs at all, `emptyState` reads "You haven't saved any jobs yet." with a "Browse jobs" link to `/dashboard`.
  - **Resync from props** for the Activity problem above. When `initialSavedIds`, `initialAppliedIds` or `jobs` change identity, reset the matching state during render. This uses the adjust-state-during-render pattern the file already has for `filterKey`, so a page shown again after a navigation reflects what changed on the other page.
- **`jobs-explorer-fallback.tsx`**: takes `showSaved`, so the static shell has the Save job column and the layout doesn't shift on hydration, and a `loading` flag that shows the table's skeleton rows (used by `/saved-jobs`, which has no static data). There is no `initialSavedIds`: the shell has no user data, same as for Applied.

### 5. Routes, navigation, proxy
- **`src/app/(app)/dashboard/page.tsx`**: fetch `getAppliedJobIds` and `getSavedJobIds` in parallel and pass `showSaved initialSavedIds` to both `JobsExplorer` and the fallback.
- **`src/app/(app)/saved-jobs/page.tsx`** (new):
  - `metadata` title "Saved jobs | Job Manager".
  - Inside `<Suspense>`: `await connection()`, `requireUser()`, then `getSavedJobs` and `getAppliedJobIds` in parallel.
  - Renders `<JobsExplorer jobs={saved} now showApplied showSaved savedOnly initialAppliedIds initialSavedIds={saved.map(j => j.id)} fillHeight />`.
  - The fallback is the table in its existing `loading` skeleton state. The list is per-user, so nothing is prerendered.
- **`src/components/dashboard/sidebar-nav.tsx`**: add `{ href: "/saved-jobs", label: "Saved jobs", icon: HeartIcon }` between Home and Applications.
- **`src/proxy.ts`**: add `/saved-jobs` to `PROTECTED_PREFIXES`.
- `src/app/page.tsx` (public `/`) is unchanged: no `showSaved`, so there is no column.

### 6. Docs
- This file: update the status and keep it in sync as it's built.
- [dashboard.md](./dashboard.md): a short note on the Save job column, linking here.
- `project-overview/architecture.md`: the `/saved-jobs` route, the `saved_jobs` table, and the new `jobs` select policy.
- `project-overview/security.md`: the `setSaved` rate limit (60/min, `saved:<userId>`).

## Verification
- **Migration:** `list_tables` shows `saved_jobs` with RLS on, and `get_advisors` has nothing new beyond the expected permissive-policy note. With the anon key, `select * from saved_jobs` returns nothing, and anon still sees only active jobs.
- **Dashboard:**
  - The heart toggles, survives a reload, and a second account doesn't see it.
  - Signed out, `/` has no Save job column.
  - More than 60 toggles a minute shows the error tooltip and reverts the heart.
- **`/saved-jobs`:**
  - It lists exactly the user's saved jobs. Search, filters, sort, paging and the Eye sheet work.
  - Unticking a heart removes the row instantly, and it stays gone after a reload.
  - Applying from here works and the job shows on `/applications`, still saved.
  - With nothing saved, it shows the empty state with a Browse jobs link.
  - Signed out, it redirects to `/sign-in`.
- **Expired:**
  - Set a saved job to `active = false` with `execute_sql`. On `/saved-jobs` it shows a gray row with "Expired" in the Applied column, or checked + "Expired" if you had applied. It's gone from `/dashboard`, and the heart can still unsave it.
  - Set it back to `active = true` and the row looks normal again.
- **Cross-page sync (Activity):** save on `/dashboard`, open Saved jobs via the sidebar, and it's there. Unsave it there, go back to Home via the sidebar, and the heart is empty without a reload. Do the same check for applying from `/saved-jobs`.
- **Build:** `npm run build` with no blocking-route errors. `npm run lint` passes.

## Out of scope
- A "Saved" filter rule (decided against).
- A "Saved on" date column or sorting by when a job was saved, since the columns stay identical to the dashboard.
- Undo or a confirmation when unsaving.
- Descriptions for expired jobs.
- Saving while signed out (for example a heart on `/` that prompts sign-in).

## Open questions
The plan uses these defaults. Each one is easy to change.
1. **Route and label:** `/saved-jobs`, "Saved jobs" in the sidebar, ordered Home → Saved jobs → Applications (browse → save → apply).
2. **Column header** is "Save job", as requested. The filled heart is rose/red.
3. **Default sort on `/saved-jobs`** is Posted, newest first, the same as the dashboard.
