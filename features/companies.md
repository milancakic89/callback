# Feature: Companies (Employer Workspace and Native Jobs)

**Status:** Implemented (the first step only: no database). `npx tsc --noEmit`, `npm run lint` and `npm run build` pass, and the pages were checked in Chromium on the dev server with a signed-out visitor and an employer test account. **Not checked:** the candidate's `/dashboard` (no candidate account was used), the production server (`npm start`) itself, and the landing page, where the dev fixture also counts toward the open-roles number. See [Verification](#verification).

Each employer gets a workspace under their company's slug (`/test`, `/test/jobs/new`). The employer home offers "Create your first job", which opens a job editor with a live candidate preview. Jobs posted on Callback ("native" jobs) are listed first in the candidate job table and highlighted. There is no database work in this step: the one company and one test job live in code.

## Context

The employer side is a placeholder at `/employer` ([account-types.md](./account-types.md)). The next step is to give a company its own space and let it post jobs.

A job posted on Callback is worth more to a candidate than a scraped one. We can track the application and update its status automatically, while for scraped jobs the candidate has to update the status by hand. So native jobs come first in the list and stand out from the rest.

### Decisions
- **The whole employer area moves under the company slug.**
  - `/{company}` is the employer dashboard and `/{company}/jobs/new` the job form; `/employer` stops being a page.
  - Until a `companies` table exists, there is one company in code, `test`, and every employer account belongs to it. Any other slug is a 404.
  - The public careers page will need another path later (e.g. `/careers/{slug}`), since `/{slug}` is the employer's workspace.
- **The test job is a dev-only fixture in code.** It is added to the job list only when `NODE_ENV=development`, so real visitors never see a fake posting. No database change.
- **The job form is an editor plus a live preview.**
  - Title and Description on the left.
  - On the right, the posting as a candidate will see it, with an Apply button that does nothing yet.
  - Nothing is submitted or stored.
- **Native jobs are always first, under any sort, but still respect search and filters.**
  - They are highlighted with a strongly lime-tinted row and a dark "Auto-tracked" badge.
  - Their Source shows "Callback".

## Implementation

Where the code differs from the plan first written for this step:
- **`params` is read inside Suspense, never at the top of the layout or a page.** Next's "URL data outside of Suspense" insight (partial prefetching) flags a page that does `await params` at its top, because that ties the shared App Shell to one URL.
  - `getCompanyOrNotFound()` (`src/lib/companies/get-company.ts`) awaits the `params` promise and resolves the company, or throws `notFound()`.
  - **The layout** wraps the whole shell in `<Suspense>` and calls it inside, so an unknown slug throws before any employer chrome renders. A first attempt, with the check only in the pages, showed the employer sidebar around the not-found page for every unknown URL and sent signed-out visitors to sign-in.
  - **The pages** are plain components that pass `params` to a child inside their own `<Suspense>` (skeleton fallbacks, since the company isn't known there).
  - **One cost:** `notFound()` now runs after the first bytes are sent, so an unknown slug such as `/foo` answers HTTP 200 (the page is still the ordinary not-found page). Paths no route matches, like `/blah/deep`, are still a real 404. Fine while one company exists; the alternative, if a true 404 matters later, is `export const instant = false` on the layout, which brings back the blocking `await params` at the price of non-instant navigation.
- **`/employer/:path*` redirects to `/test/:path*`** as well as `/employer`, so an old deep link keeps its path.
- **The dev fixture also reaches the landing page in development.** It comes from `getActiveJobs()`, which the landing page reads for the open-roles count and its newest postings. It never appears in a production build.

### 1. Company fixture and routes
- **New `src/lib/companies/company.ts`.** It has no `server-only`, because proxy uses it through `homeFor`.
  - `type Company = { slug: string; name: string }` and `TEST_COMPANY = { slug: "test", name: "Test company" }`.
  - `getCompanyBySlug(slug): Company | null`, which only knows `TEST_COMPANY` for now.
  - `companyHome(company) => "/" + slug`.
  - A comment says every employer account belongs to this company until the `companies` table exists.
- **`src/lib/auth/account-type.ts`.**
  - `homeFor("employer")` returns `companyHome(TEST_COMPANY)`, which is `/test`. Update the comment that mentions `/employer`.
  - `signIn`, `resetPassword`, `/auth/confirm` and the activation email link (`src/lib/mail.ts`) all call `homeFor`, so they follow automatically.
- **Move the employer routes.**
  - `src/app/(employer)/layout.tsx` → `src/app/(employer)/[company]/layout.tsx`, with `generateStaticParams() => [{ company: TEST_COMPANY.slug }]`.
    - Under Cache Components this prerenders `/test`. The layout is not `async`: it wraps the shell in `<Suspense>` (fallback: a plain frame with the logo, because `<DashboardSidebar>` reads the pathname) and checks the slug inside.
    - See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`, "With Cache Components".
  - `src/app/(employer)/employer/page.tsx` → `src/app/(employer)/[company]/page.tsx`.
- **The order of checks on employer pages.**
  - Each page is a plain (non-async) component that passes `params` down to a child inside `<Suspense>`.
  - The child does `getCompanyOrNotFound(params)` → `connection()` → `requireAccountType("employer")`, in that order.
- **`src/proxy.ts`.** `EMPLOYER_PREFIXES = [companyHome(TEST_COMPANY)]`. Guest protection and the candidate redirect work as before.
- **`next.config.ts` `redirects()`.** `/employer` → `/test`, not permanent, because activation emails already sent carry `next=/employer`. It is temporary until the slug comes from the account.
- **`src/components/dashboard/sidebar-nav.tsx`.**
  - Employer items are relative to the company slug: the first path segment from `usePathname()`, which the component already reads.
  - `Dashboard` points at `/${slug}`.
  - No new sidebar items.

### 2. Employer dashboard: "Create your first job"
- **`[company]/page.tsx`.**
  - The heading stays "Employer dashboard".
  - `EmptyState` reads "No jobs yet" and gets a CTA: a `Link` styled with `buttonVariants()`, as in `jobs-explorer.tsx`.
  - The CTA, **Create your first job**, goes to `/${company.slug}/jobs/new`.
- **"When there are no jobs."**
  - Jobs can't be stored yet, so a company always has zero and the CTA always shows.
  - Once `job_postings` exists, this becomes a job list or the CTA.
  - The dev fixture job (step 4) belongs to a different, fictional company. It only tests the candidate list and doesn't affect this condition.

### 3. The job form, `/{company}/jobs/new`
- **`src/app/(employer)/[company]/jobs/new/page.tsx`.**
  - `metadata` with the title "Create job | Callback".
  - A non-async page: the heading is static, and `params` goes to a child inside `Suspense` (fallback: two skeleton cards in the editor's grid).
  - The child does `getCompanyOrNotFound(params)`, `requireAccountType("employer")`, then renders `<JobEditor companyName={company.name} />`.
- **`src/components/employer/job-editor.tsx` (client).**
  - Two columns from `lg` up, stacked below that.
  - **Left:** a controlled `Input` for the title (maxLength 120) and a `Textarea` for the description, each with a `Label`.
  - **Right:** a "Candidate preview" `Card` with:
    - the title, or a muted "Job title" placeholder;
    - the company name;
    - the description as `whitespace-pre-wrap` plain text, never HTML;
    - a `Button type="button"` **Apply** with no handler, and the note "Preview: candidates will apply here".
  - There is no `<form>` and no Server Action, since nothing is saved.
- **`src/components/ui/textarea.tsx`.** Add it with `npx shadcn add textarea`, or write it by hand after `input.tsx` if the CLI fails.

### 4. Native jobs in the candidate list
- **`src/lib/jobs/types.ts`.**
  - `SOURCE_LABELS.callback = "Callback"`.
  - `isNativeJob(job) => job.source === "callback"`.
  - The `JobListItem` shape stays the same.
- **New `src/lib/jobs/dev-fixtures.ts`.**
  - `DEV_NATIVE_JOBS: { job: JobListItem; description: string }[]`, empty outside `development`.
  - It holds one job:
    - id `callback:dev-1`, source `callback`, company "Callback Demo Co";
    - e.g. "Senior React Developer", Belgrade, HYBRID;
    - `url: null` and a fixed ISO `postedAt`.
  - A comment says it is a fictional posting for testing the display, never shown in production.
- **`src/lib/jobs/queries.ts`.**
  - `getActiveJobs()` returns `[...DEV_NATIVE_JOBS.map((j) => j.job), ...rows]`.
  - `getJobDescriptions()` adds their descriptions.
  - Both stay `'use cache'`; `NODE_ENV` is a constant, so caching is unaffected.
- **Priority (`sortJobs` in `src/lib/jobs/filter.ts`).**
  - After sorting and reversing, a stable partition puts native jobs first, then the rest. Native jobs follow the chosen sort among themselves.
  - Filtering runs before sorting (`jobs-explorer.tsx`), so search and filters still apply.
  - The static fallback (`jobs-explorer-fallback.tsx`) uses the same `sortJobs`, so the static shell has the same order.
- **Highlighting (`src/components/jobs/table-parts.tsx`, `jobs-table.tsx`).**
  - A new `NATIVE_ROW_CLASS`:
    - `bg-primary/40` (`hover:bg-primary/50`) on desktop and on the mobile card, instead of the zebra stripe (a first try at 15% was too easy to miss);
    - `max-md:ring-2 max-md:ring-primary` on the card.
  - From `md` up, a 6px bar in the ink colour (`--primary-foreground`) on the left edge and a lime hairline above and below the row. They are inset `box-shadow`s on the cells, picked by the row's child selectors, because a shadow on the `<tr>` isn't reliable.
  - The title is `font-semibold` instead of `font-medium`.
  - An **Auto-tracked** `Badge` with a zap icon, in the ink colour (`bg-foreground text-background`, like the table header: the default lime badge would barely show on the lime row), next to the title, with a `Tooltip`: "Posted on Callback. Your application status updates automatically."
  - This follows [visual-continuity.md](./visual-continuity.md): lime is only a fill, never text on white. The badge carries the meaning; the bar is decoration.
- **The Applied and Save columns for native jobs** show "—" instead of `AppliedCheckbox` and `SaveJobButton`.
  - A native job's status is tracked automatically.
  - `applications` and `saved_jobs` have a foreign key to `jobs`, so writing a row for the fixture would fail.
  - Revisit both once native jobs are stored.
  - The eye still opens the description. The title is plain text, since there is no `url`.

## Files
- **Changed:**
  - `src/lib/auth/account-type.ts`, `src/proxy.ts`, `next.config.ts`;
  - `src/components/dashboard/sidebar-nav.tsx`;
  - `src/lib/jobs/types.ts`, `queries.ts`, `filter.ts`;
  - `src/components/jobs/jobs-table.tsx`, `table-parts.tsx`.
- **Moved:** `src/app/(employer)/layout.tsx` and `employer/page.tsx` → `src/app/(employer)/[company]/…`.
- **New:**
  - `src/lib/companies/company.ts`, `src/lib/jobs/dev-fixtures.ts`;
  - `src/app/(employer)/[company]/jobs/new/page.tsx`, `src/components/employer/job-editor.tsx`, `src/components/ui/textarea.tsx`.
- **Docs, when this is implemented:**
  - [account-types.md](./account-types.md): the routing table changes from `/employer` to `/{company}` (for now `/test`), plus a note on the redirect.
  - [roadmap.md](../project-overview/roadmap.md): a new phase, "Employer: companies & jobs", linking here.

## Verification
**Done** (dev server and Chromium, the employer test account signed in through the real sign-in form):
- `npx tsc --noEmit`, `npm run lint` and `npm run build` pass. The build prerenders `/test` and `/test/jobs/new`, which is the Cache Components check for `[company]`.
- **`/jobs` as a guest:**
  - The test job is the first row on page 1, with the lime row, the dark "Auto-tracked" badge, a bold title, Source "Callback" and a dark bar on the left edge.
  - It stays first when sorting by Label, Company, Work mode and Posted, in both directions.
  - It disappears when the search doesn't match it ("No jobs match.").
  - At 390px the card is highlighted too (lime tint and a 2px lime ring).
- **The employer pages** (checked before `params` moved into Suspense; re-check under Still to do):
  - Sign-in lands on `/test`, which shows "No jobs yet" and "Create your first job".
  - The CTA opens `/test/jobs/new`. Typing updates the preview, an HTML tag in the description shows as plain text, and Apply does nothing.
  - The sidebar has one item, Dashboard, pointing at `/test`.
- **Routing:**
  - A signed-out visitor on `/foo`: the ordinary not-found page (HTTP 200, see Implementation), no sidebar, no redirect to sign-in. On `/blah/deep`: a real 404. On `/test/nope`: proxy redirects to `/sign-in`.
  - A guest on `/test` or `/test/jobs/new` → `/sign-in`.
  - `/employer` and `/employer/jobs/new` → `/test` and `/test/jobs/new`.
  - The signed-in employer on `/jobs`, `/employer` or `/dashboard` → `/test`.
- **The production build** (`.next/server`) has no trace of the fixture outside source maps.

**Still to do** (the sign-in rate limit, 5 per 15 minutes, was used up by repeated checks, so these wait):
- As the signed-in employer, after the move of `params` into Suspense: `/test` → "Create your first job" → `/test/jobs/new` by client navigation, and back through the sidebar, with the Next dev overlay showing no "URL data outside of Suspense" insight. The only check done so far is that the build, `tsc` and lint pass, and the guest pages above behave. (An overlay check taken before the layout was reworked was empty, but no insight had been reproduced to prove that method catches one.)
- As the signed-in employer: `/foo` and `/test/nope` show the not-found page without the sidebar.
- Sign in as a **candidate** on `/dashboard` and check that the test job is first there, with "—" in the Applied and Save columns, and that a candidate on `/test` is sent to `/dashboard`.
- Run `npm run build && npm start` and look at `/jobs` and the landing page for the absence of the test job.
- The landing page in development, where the open-roles count includes the fixture.

## Later phases
1. **A `companies` table.**
   - Columns: `owner_id`, a unique `slug`, and a list of reserved slugs (`admin`, `api`, `jobs`, `careers`, …).
   - The slug goes into `app_metadata`, so proxy and `homeFor` read it from the JWT.
   - Membership checks replace the single fixture company.
2. **`job_postings`.** The editor saves to it; the dashboard shows the company's jobs, or the CTA.
3. **Native jobs in the candidate list come from the database** instead of the fixture. Saving them works again.
4. **A public careers page, `/careers/{slug}`.** It carries the company's branding (logo, colour) and lists open positions.
5. **The application form.**
   - It is built from per-job questions stored as `jsonb`, with the questions snapshotted on each application.
   - Applications go into a new `job_applications` table.
   - A signed-in candidate's application shows up in their `/applications`, with its status updated automatically.
6. **Reviewing applications** in the employer workspace: list, CV download through a signed URL, status changes.
