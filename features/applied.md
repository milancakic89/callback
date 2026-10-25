# Feature: Applications Page (Phase 4, first slice)

**Status:** Implemented. The migration was applied to the Supabase project by hand on 2026-10-23 (SQL Editor), so `supabase_migrations` has no record of it — see the note under "Verification". The schema, policies and grants were checked against the database; the UI has not been clicked through end to end.

A new `/applications` page lists every job the signed-in user has applied to, with a status they can change. On `/dashboard`, applying becomes a one-way action: ticking Applied opens a confirmation dialog, and once confirmed the checkbox stays checked and disabled for good.

## Context

[features/dashboard.md](./dashboard.md) shipped a minimal `applications` table (`user_id`, `job_id`, `applied_at`) behind a checkbox that toggles both ways (`setApplied(jobId, applied)` inserts or deletes). Phase 4 of [roadmap.md](../project-overview/roadmap.md) planned the `/applications` page and a `status` column. This plan covers that page and status, and changes the checkbox to be irreversible.

### Decisions
- **Applications stay in the existing `public.applications` table**: one row per (user, job). There is no array of job IDs on the user. Supabase Auth owns `auth.users`, there is no profile table, and status has to be stored per application anyway, so a row per application is where it belongs.
- **Applying can't be undone, and the database enforces it.** The delete policy and the `DELETE` grant are removed, so no client can remove a row, whatever the UI does.
- **Confirmation first.** Clicking an unchecked Applied checkbox opens a dialog. Only "Yes, I applied" saves. Cancel, Escape or clicking outside leaves the checkbox unchecked.
- **After applying**, the checkbox is checked and disabled on every visit. The Server Action has no "unapply" path.
- **Route `/applications`**, labelled "Applications" in the sidebar under Home.
- **Columns:** Label (job title, linking to the posting), Company, Applied (date), Status.
- **Status** is a dropdown with four values: Pending, Long time no answer, Rejected, Got offer.
  - A new application starts as Pending.
  - Any value can change to any other value, including back to Pending.
  - Each change saves immediately. There is no Save button.
- **A job the scraper has taken down (`active = false`) stays on the page.** Its row has a gray background and an "Expired" badge next to the label.
  - "Expired" is not a status. The user's status is kept and can still be changed.
  - If the job reappears and becomes active again, the row goes back to normal.
- **The table sorts and pages**, in the same style as the dashboard table. It has no search and no filters.

### Constraints found in the code
- **RLS on `public.jobs` only allows reading active rows** ("Active jobs are public"). A join from `applications` to an inactive job would return `null`. A second select policy lets a user read the jobs they applied to, whatever their `active` value.
- **There is no update policy or grant on `applications` yet.** Status needs both, and the grant is limited to the `status` column, so `job_id`, `user_id` and `applied_at` can't be changed.
- **Applying again must not reset the status.** `markApplied` keeps `insert … on conflict do nothing` (`ignoreDuplicates: true`), so a second request for the same job changes nothing.
- **`usePathname` needs no `<Suspense>` here** (`01-app/03-api-reference/04-functions/use-pathname.md`, "Cache Components"). Both `/dashboard` and `/applications` are static routes with no dynamic params, and the proxy only redirects and never rewrites, so there is no hydration mismatch either.
- **`formatAbsolute()` calls `toLocaleDateString` without a time zone.** In a hydrated Client Component, a server in UTC and a browser in Belgrade can show different days for an `applied_at` near midnight. The Applied date is formatted with an explicit `timeZone: "Europe/Belgrade"`. (The dashboard only uses `formatAbsolute` in its Suspense fallback, where hydration never happens.)

## Data model

New migration `supabase/migrations/<timestamp>_applications_status.sql`:

```sql
create type public.application_status as enum ('PENDING', 'NO_ANSWER', 'REJECTED', 'OFFER');

-- Existing rows become PENDING.
alter table public.applications
  add column status public.application_status not null default 'PENDING';

-- Applying is irreversible (features/applied.md): no client can delete a row.
drop policy "Users can unmark a job as applied" on public.applications;
revoke delete on public.applications from authenticated;

-- Status is the only column a user can change.
create policy "Users can update the status of their own applications"
  on public.applications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant update (status) on public.applications to authenticated;

-- /applications keeps showing jobs the scraper has marked inactive. Permissive policies are
-- OR'd with "Active jobs are public", so anon still sees only active jobs.
create policy "Users can read jobs they applied to"
  on public.jobs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.job_id = jobs.id and a.user_id = (select auth.uid())
    )
  );
```

- The `(user_id, job_id)` primary key already serves the `exists` lookup. No new index is needed.
- The dashboard's job list is unaffected. `getActiveJobs()` reads through `supabasePublic` (anon) and also filters with `.eq("active", true)`.
- Supabase's advisor may warn about "multiple permissive policies" on `jobs` for `authenticated`. That is expected, and the cost is one primary-key lookup per row read.

| Enum value | Label in the UI |
|---|---|
| `PENDING` | Pending |
| `NO_ANSWER` | Long time no answer |
| `REJECTED` | Rejected |
| `OFFER` | Got offer |

## UI sketch

**Dashboard: confirmation dialog**

```
┌──────────────────────────────────────────────────────┐
│ Mark as applied?                                     │
│                                                      │
│ "Senior Frontend Developer" at Nordeus will move to  │
│ Applications. This can't be undone.                  │
│                                                      │
│                       [ Cancel ]  [ Yes, I applied ] │
└──────────────────────────────────────────────────────┘
```

**`/applications`**

```
Callback =>      │ Showing 1–4 of 4                           Rows per page 50 ▾
                 │ Label ↕                     Company ↕  Applied ↓    Status ↕
 ⌂ Home          │ Senior Frontend Developer   Nordeus    22 Oct 2026  [Pending        ▾]
 ▣ Applications  │ Frontend Engineer (Vue)     Fivetran   21 Oct 2026  [Got offer      ▾]
                 │ ░React Dev [Expired]░░░░░░░ ░Acme░░░░░ ░20 Oct 2026 [Rejected       ▾]░
                 │ Backend Developer           Seven      19 Oct 2026  [Long time no … ▾]
 user@mail.com   │                                       ‹ Previous  Page 1 of 1  Next ›
 [Sign out]      │
```

- **Label** links to the posting in a new tab (`rel="noopener noreferrer"`), the same as the dashboard. A job without a URL shows plain text.
- **Applied** is an absolute date (`22 Oct 2026`). The default sort is Applied, newest first.
- **Sortable columns:** Label, Company, Applied, and Status (in enum order: Pending → Long time no answer → Rejected → Got offer).
- **Status colors** use a small dot in the dropdown trigger: neutral for Pending, amber for Long time no answer, red for Rejected, green for Got offer.
- **Expired rows** have a gray background in place of the zebra stripe and muted text. The status dropdown keeps working.
- **Empty state:** "You haven't applied to any jobs yet." with a "Browse jobs" link to `/dashboard`.

## Implementation Steps

### 1. Migration
- Add `supabase/migrations/<timestamp>_applications_status.sql` (above) and apply it with the Supabase MCP `apply_migration`.
- Check with `list_tables` and `get_advisors` afterwards.

### 2. Shared types — `src/lib/applications/types.ts` (client-safe)
- `APPLICATION_STATUSES = ["PENDING", "NO_ANSWER", "REJECTED", "OFFER"] as const`, the `ApplicationStatus` type and `APPLICATION_STATUS_LABELS`, following the `WORK_MODES` pattern in `src/lib/jobs/types.ts`.
- `ApplicationListItem`: `jobId`, `status`, `appliedAt`, `title`, `companyName`, `url`, `active`.

### 3. Query — `src/lib/applications/queries.ts` (`server-only`)
- `getApplications(userId)`:
  - Uses the session client from `src/lib/supabase/server.ts`, so RLS applies. Not cached, because it reads cookies.
  - `from("applications").select("job_id, status, applied_at, job:jobs(title, company_name, url, active)").eq("user_id", userId)`.
  - Maps rows to camelCase `ApplicationListItem`.
  - A row whose `job` is `null` (it shouldn't happen once the new policy is in place) is still listed, with the label "Job no longer available".

### 4. Server Actions
- **`markApplied(jobId)`** replaces `setApplied(jobId, applied)` in `src/app/(app)/dashboard/actions.ts` (the file moves in step 6).
  - `requireUser()`, zod validation (`jobId`: a non-empty string of at most 300 characters), and the existing rate limit (60/min, key `applied:<userId>`).
  - `upsert({ user_id, job_id }, { onConflict: "user_id,job_id", ignoreDuplicates: true })`.
  - The delete branch and the `applied` parameter are removed.
- **`setApplicationStatus(jobId, status)`** in the new `src/app/(app)/applications/actions.ts`.
  - `requireUser()`, zod validation (`jobId` as above, `status` in `APPLICATION_STATUSES`), and a rate limit of 60/min with key `application-status:<userId>`.
  - `update({ status }).eq("user_id", user.id).eq("job_id", jobId).select("job_id")`. Zero rows returned means the user never applied to that job, and the action returns `{ ok: false, error: "Application not found." }`.
- Both return `{ ok: true } | { ok: false; error: string }`, the same shape as today.

### 5. Dashboard: confirm-then-apply
- **Add the shadcn `alert-dialog`** (`npx shadcn@latest add alert-dialog`; the `base-nova` style maps it to Base UI's AlertDialog).
- **`src/components/jobs/apply-confirm-dialog.tsx`** (new): `job: JobListItem | null` (open while non-null), `onCancel`, `onConfirm`. Cancel is the default focus, so pressing Enter by accident doesn't apply.
- **`applied-checkbox.tsx`**:
  - When applied: `checked`, `disabled`, and `aria-label` "Applied to "<title>"". There is no handler.
  - When not applied: ticking calls `onRequestApply()`. The checkbox stays unchecked, because it is controlled by `appliedIds`.
  - The existing `pending` and `error` tooltip behavior stays.
- **`jobs-explorer.tsx`**:
  - New state `confirmingJob: JobListItem | null`, with one `<ApplyConfirmDialog>` for the whole table rather than one per row.
  - `handleToggleApplied` becomes `handleApply(jobId)`: it adds the ID optimistically, sets pending, calls `markApplied`, and on error removes the ID and shows the error tooltip. The "unmark" branch is removed.
  - On confirm, the dialog closes immediately and the optimistic update shows the result.
- **`jobs-table.tsx`**: the prop `onToggleApplied(jobId, next)` becomes `onRequestApply(job)`.
- The Applied filter rule ("is applied" / "is not applied") doesn't change.

### 6. Shared app shell and sidebar
- **Move `src/app/dashboard/` to the route group `src/app/(app)/dashboard/`.** The URL doesn't change.
- **New `src/app/(app)/layout.tsx`** takes over the shell that `dashboard/page.tsx` builds today: the `h-dvh` flex row, `DashboardSidebar` with `SidebarAccount` in its `<Suspense>`, and `<main>`. The sidebar stays mounted when moving between Home and Applications.
- **`dashboard/page.tsx`** keeps only its own content: `getActiveJobs()` and the `AuthedJobsExplorer` Suspense block.
- **Update imports**: `@/app/dashboard/actions` becomes `@/app/(app)/dashboard/actions` (the `(auth)` group already uses this style).
- **Sidebar**:
  - Split the nav into a client `src/components/dashboard/sidebar-nav.tsx` that uses `usePathname()` for the active item.
  - Items: Home (`/dashboard`, `HomeIcon`) and Applications (`/applications`, `ClipboardCheckIcon`).
  - `DashboardSidebar` stays a Server Component.

### 7. `/applications` page
- **`src/app/(app)/applications/page.tsx`**:
  - `metadata` title "Applications | Callback".
  - Inside `<Suspense>`: `await connection()`, `requireUser()`, then `getApplications(user.id)`, rendered as `<ApplicationsTable>`.
  - The fallback is a skeleton table.
- **`src/components/applications/applications-table.tsx`** (`'use client'`):
  - Owns sort, page and page size, and the optimistic status state.
  - Changing a status updates it optimistically, disables that row's select while saving, calls `setApplicationStatus`, and on error reverts and shows the error in a tooltip.
- **`src/components/applications/status-select.tsx`**: the shadcn `Select` with the four statuses and the color dot.
- **Reuse the dashboard table's look rather than copying it.** Move `HEADER_CLASS`, `ROW_CLASS`, `SortableHead` (made generic over the sort field) and the pager out of `jobs-table.tsx` into `src/components/jobs/table-parts.tsx`, and use them in both tables.
- **`src/proxy.ts`**: add `/applications` to `PROTECTED_PREFIXES`.

### 8. Docs
- `project-overview/architecture.md`:
  - Route map: `/applications` is a real page, no longer a placeholder.
  - Data model: `status` on `applications`, no delete, update of `status` only.
  - `jobs` RLS: the new "jobs they applied to" policy.
- `project-overview/roadmap.md`: Phase 4 links here. `notes` stays deferred.
- `project-overview/security.md`: `setApplied` becomes `markApplied`; add `setApplicationStatus` with its rate limit; describe the column-level update grant and that delete was removed.
- `features/dashboard.md`: a short note that Applied is now one-way with a confirmation dialog, linking here.
- The comment in `20261022125501_dashboard_applications.sql` stays as it is, because migrations aren't edited after they've been applied.

## Verification
- **Migration history:** the migration was run in the SQL Editor, so `list_migrations` doesn't list it. Before using `supabase db push`, run `supabase migration repair --status applied 20261023100000`, or `push` will try to run it again and fail on `create type`.
- **Confirmation:**
  - Ticking Applied opens the dialog.
  - Cancel, Escape and clicking outside leave it unchecked, and nothing is written (`select * from applications` is unchanged).
  - "Yes, I applied" checks and disables it.
  - After a reload it is still checked and disabled.
- **Irreversible in the database:** a `delete from applications` run with the user's session (as `authenticated` with that `auth.uid()`) removes 0 rows. The same goes for an `update applications set job_id = …`.
- **Idempotent:** calling `markApplied` again for a job already set to `REJECTED` leaves it `REJECTED`.
- **`/applications`:**
  - It lists exactly the user's rows, with the right Company and Applied date, newest first.
  - A second account sees only its own applications.
  - Signed out, `/applications` redirects to `/sign-in`.
- **Status:**
  - A change survives a reload.
  - An invalid value sent to the action (e.g. `"HIRED"`) is rejected.
  - More than 60 changes a minute shows an error and the select reverts.
- **Expired:**
  - Set one applied job to `active = false` with the service role. It still shows on `/applications`, gray, with the Expired badge and its status kept.
  - The same job is missing from `/dashboard` and from `/` signed out.
  - Set it back to `active = true` and the row looks normal again.
- **Sidebar:** the active item follows the page, and the account block doesn't flash on navigation between Home and Applications.
- **Build:** `npm run build` with no blocking-route errors. `npm run lint` passes.

## Out of scope
- `notes` on an application, status history, and when the status last changed.
- Search and filters on `/applications`.
- Any way to undo an application, including an admin or support path.
- Adding applications by hand for jobs that aren't in `public.jobs`.

## Open questions
The plan uses these defaults. Each one is easy to change.
1. **UI text is in English**, like the rest of the app: "Mark as applied?", "Yes, I applied", the status labels in the table above.
2. **The dialog closes as soon as you confirm**, and the checkbox updates optimistically. If saving fails, it unchecks and shows the error, so you can try again. The alternative is to keep the dialog open with "Applying…" until the server answers.
3. **Applied is shown as a date** (`22 Oct 2026`), not relative ("3d ago").
4. ~~**Rows that are already in `applications`**~~ Moot: the table had 0 rows when the migration was written (2026-10-23).
5. **Status colors** (neutral / amber / red / green) are a suggestion. Plain text without colors also works.
