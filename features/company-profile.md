# Feature: Company Profile (Company Overview)

**Status:** Done and checked, on the branch `feature/company-profile`, 2026-11-09. Both migrations are applied (`company_profiles.sql` by the user by hand in the SQL editor, `company_profile_slug_check.sql` through `apply_migration` on the user's go-ahead, so neither has a version of its own except the second one in the migration history). `npm test` (57 files, 647 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass; three deliberate breakages of the new code each turned the suite red; the database was checked as real users; and an employer, a candidate and a guest were driven through the whole flow in headless Chromium against the production build and the real database. Checking against the database found a bug the unit tests could not (saving failed for every company with a slug until the grant in the second migration), and it is fixed. Not committed, not pushed.

## Context
A candidate who reads a posting on `/jobs/{id}` learns the job and only the company's name: the `companies` table has `name` and `slug` and nothing that says what the company does. Each company gets a profile it writes once: a description of the company and what it does, plus a few facts. The same profile is shown on **every** job post the company publishes ("About {company}"), and on a public company page that also lists its open positions. This covers part of "Later phases" 4 in [companies.md](./companies.md) (a public company page), without branding.

## Decisions (agreed with the user, 2026-11-09)
- **Fields:** a description (plain text, like a job description) and four optional facts: website, industry, company size, headquarters. The name stays as chosen on `/setup`.
- **One profile, shown live.** A posting reads the company's current profile; there is no per-job copy. Saving the profile updates every posting at once.
- **The public page is `/companies/{slug}`:** the profile and the list of open positions, open to everyone (guest, candidate, employer). `companies` is already a reserved slug, so no company can collide with it and the slug rules don't change.
- **The employer edits it at `/{slug}/profile`,** a new "Company profile" item in the sidebar, as a form with a live preview of what candidates see (same layout idea as the job editor).
- **Plain text only, never HTML,** rendered with `whitespace-pre-wrap`, as job descriptions are.
- **A website is `http(s)` only,** checked by zod and by the database, and opens in a new tab with `rel="noopener noreferrer nofollow ugc"`.

## Where the code differs from the plan
- **Components live in `src/components/company/`** (it already held `setup-form.tsx`), not `companies/`: `company-about.tsx` and `open-positions.tsx`. The employer-side ones are in `src/components/employer/`: `company-profile-editor.tsx` and `job-preview.tsx`.
- **`getCompanyProfile()` and `getCompanyPublishedJobs()` are thin wrappers** that refuse a slug that can't be a company's (`isValidSlug`) and then call a private `'use cache'` function. The check has to come before the cache: the slug is whatever a visitor typed, and would otherwise become a cache key and a tag of any length. Tested: no RPC and no `cacheTag` for a bad slug.
- **The form state has `message`, not `saved`,** because `FormAlert` already shows a `message` as a success note. The text, `PROFILE_SAVED_MESSAGE`, is exported from `src/lib/companies/profile.ts`: a `"use server"` file may only export functions.
- **The sidebar uses `activeNavHref(pathname, hrefs)`** (`src/components/dashboard/active-nav-item.ts`, longest matching address wins) instead of an `exact` flag. An exact Dashboard would also have lost its highlight on `/{slug}/jobs/new`; this keeps it there and takes it away only from `/{slug}/profile`.
- **`src/lib/validation/text-fields.ts` also exports `optionalText(max)`,** and the job form's `location` uses it now. `job-posting.test.ts` is untouched and passes.
- **`normalizeWebsite()`, `previewProfile()` and `PROFILE_SAVED_MESSAGE`** are in `profile.ts`. A website is read as a URL with `https://` in front when it has no `http(s)://`, so `javascript:`, `data:` and `ftp://` fail as a broken host or a host with no dot; `mailto:a@b.com` reads as a name and password and is refused for that.
- **The posting page survives a profile it can't read:** `loadCompanyProfile()` catches the error, logs it and shows the job without the "About" card. The company page itself throws, as the other cached reads do.
- **The profile editor reads the cached profile** (`getCompanyProfile`), as planned. `updateTag` makes the next read fresh, so the form shows what was just saved.
- **Component tests** render to static markup with `react-dom/server` in the node environment (`*.test.ts` with `createElement`; there is still no jsdom or Testing Library). `PublicHeader` and the pages have none: they are async server components that read the session.
- **A second migration, `20261109170000_company_profile_slug_check.sql`,** grants `authenticated` EXECUTE on `company_slug_valid(text)`. Postgres runs every CHECK constraint of a row on an update, so `companies_slug_valid` is evaluated when the owner saves the profile, and `company_slugs.sql` had revoked that function from clients: the update failed with `42501`. Unit tests with mocked Supabase cannot see this; running the update as a real owner did. `profile.test.ts` checks that exactly one migration carries the grant.
- **`"companies"` moved** from the extra reserved words of `RESERVED_SLUGS` to `APP_ROUTES` (which `RESERVED_SLUGS` includes), so the reserved set is the same and `company_slug_valid` needs no new migration.

## The screens
- **`/{slug}/profile` (employer):** Description (textarea with a character count), Website, Industry, Company size (select), Headquarters; Save; a "Saved" note after success; field errors as on the job form. On the right the preview: exactly the "About {company}" card a posting will show. A "View public page" link to `/companies/{slug}`.
- **`/jobs/{id}`:** the company name links to `/companies/{slug}`. Below the job description card, an "About {company}" card (description and facts) with "View company profile and open positions". Hidden when the company has written nothing.
- **The job editor's preview** (`/{slug}/jobs/new`, `/{slug}/jobs/{id}/edit`): shows the same "About" card under the description; with an empty profile, a muted hint "Candidates will see your company description here" linking to `/{slug}/profile`.
- **`/companies/{slug}`:** the posting page's own header; the company name and facts; the description; "Open positions (N)" with each job's title (link to `/jobs/{id}`), location, work mode and "Posted {date}" (absolute date via `formatAbsolute(..., "UTC")`, no `Date.now()`); "No open positions right now." when there are none. An unknown slug or a company not set up is the not-found page. Metadata: `{name} | Callback`, description from the first ~160 characters of the profile.

## Plan

### 1. Database: `supabase/migrations/20261109160000_company_profiles.sql`
- `create type public.company_size as enum ('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+')`.
- `alter table public.companies add column description text, website text, industry text, size public.company_size, headquarters text`, each null or trimmed and non-empty, with checks: description ≤ 5,000; website ≤ 200 and `~* '^https?://[^[:space:]]+$'`; industry ≤ 80; headquarters ≤ 200.
- **Write path:** a column-level grant `grant update (description, website, industry, size, headquarters) on public.companies to authenticated` plus a policy "Owners can update their company profile" (`for update using/with check (owner_id = (select auth.uid()))`). Name, slug, owner and `demo_seeded_at` stay unwritable by clients.
- **RPC `public_company_profile(p_slug text)`:** `security definer`, `search_path = ''`, `stable`, executable by `anon` and `authenticated`. Returns `name, slug, description, website, industry, size, headquarters` of a company with a name and a slug, nothing else (no id, no owner).
- **`published_job_postings`** gains `p_company_slug text default null` (Postgres can't add a parameter with `create or replace`: `drop function public.published_job_postings(uuid)` then create it again in the same migration, re-grant to `anon, authenticated`). The deployed code calls it with `{}` or `{ p_job_id }`, which still works, so the migration can go first.

### 2. Shared helpers (reuse first)
- **Move** the private `text` transform and `tooLong()` out of `src/lib/companies/job-posting.ts` into `src/lib/validation/text-fields.ts` (exported); `job-posting.ts` imports them. Its existing tests stay unchanged and must pass.
- **New `src/lib/companies/profile.ts`** (no `server-only`; the form uses the limits):
  - `CompanyProfile` type, `CompanyProfileRow`, `toCompanyProfile(row)` field by field (as `toPublishedJob` in `src/lib/jobs/published.ts`);
  - `COMPANY_SIZES` + `companySizeLabel()` ("1,000+ employees");
  - limits `PROFILE_DESCRIPTION_MAX = 5_000`, `WEBSITE_MAX = 200`, `INDUSTRY_MAX = 80`; headquarters reuses `LOCATION_MAX` from `job-posting.ts`;
  - `companyProfileSchema` (zod): empty → null, CRLF normalised, website without a scheme gets `https://`, refuses any other scheme and a host without a dot;
  - `companyFacts(profile)` → `{ label, value, href? }[]`, `websiteLabel(url)` ("https://www.acme.com/" → "acme.com"), `hasCompanyDetails(profile)`;
  - `companyProfilePath(slug)` = `/companies/{slug}`, `companyProfileEditPath(slug)` = `/{slug}/profile`, `companyCacheTag(slug)` = `company:{slug}`.
- **`truncateText(text, max)`** in `src/lib/jobs/format.ts` (cuts at a word, adds "…"), for the page's meta description.

### 3. Data
- **New `src/lib/companies/profile-queries.ts`** (`server-only`): `getCompanyProfile(slug)`, `'use cache'`, `cacheLife("hours")`, `cacheTag(companyCacheTag(slug))`, through `supabasePublic` (cookie-free, so it is allowed inside `'use cache'`); an invalid slug (`isValidSlug`) returns null without asking the database; an RPC error throws.
- **`src/lib/jobs/queries.ts`:** `fetchPublishedJobs` takes `{ jobId?, companySlug? }` and builds the same argument objects as today for the existing callers; new `getCompanyPublishedJobs(slug)` under the existing `'use cache'` / `cacheTag("jobs")`, so publishing and unpublishing (already `updateTag("jobs")`) refresh the profile page's list.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md` and `cacheTag.md` before writing the cache code (AGENTS.md: this Next.js differs).

### 4. The action `saveCompanyProfile`
`src/app/(employer)/[company]/(workspace)/profile/actions.ts`, in the order the other actions use (`src/app/setup/actions.ts`, `src/app/(employer)/[company]/actions.ts`):
1. `companyProfileSchema.safeParse` → `{ fieldErrors }` on failure, nothing touched;
2. `requireAccountType("employer")` (`src/lib/auth/dal.ts`);
3. `rateLimit` with `postgresStore` (`src/lib/rate-limit.ts`), key `company-profile:${user.id}`, 30 an hour;
4. `createClient().from("companies").update({ description, website, industry, size, headquarters }).eq("slug", user.companySlug).select("slug")`: the slug comes from the session, never the form; zero rows → "Company not found.";
5. `updateTag(companyCacheTag(slug))`, then return `{ saved: true }` (the form stays on the page).
State type `CompanyProfileFormState = { error?; fieldErrors?; saved? }`, the same shape `FormAlert` / `FieldError` (`src/components/auth/form-feedback.tsx`) already work with.

### 5. UI
- **New `src/components/company/company-about.tsx`** (server-safe, no hooks): the "About {company}" card body: facts row (industry, size, headquarters, website link) and the description. Used by the posting page, the job editor preview, the profile editor preview and `/companies/{slug}`.
- **New `src/components/employer/company-profile-editor.tsx`** (client): controlled fields + `useActionState(saveCompanyProfile)` + the preview with `CompanyAbout`. If it passes ~300 lines, split the fields into `company-profile-fields.tsx`.
- **New `src/app/(employer)/[company]/(workspace)/profile/page.tsx`:** static heading and `metadata`; inside Suspense, `getCompanyOrNotFound(params)` → `connection()` → `requireAccountType("employer")` → `getCompanyProfile(company.slug)` → the editor (the pattern of `jobs/[jobId]/edit/page.tsx`, params never awaited outside Suspense).
- **`src/components/dashboard/sidebar-nav.tsx`:** add `{ href: /${slug}/profile, label: "Company profile", icon: Building2Icon }`; the active check becomes a pure `isNavItemActive(pathname, href, exact)` with the root "Dashboard" item exact, otherwise Dashboard stays highlighted on `/profile`.
- **Job editor:** extract the preview card from `src/components/employer/job-editor.tsx` (248 lines today) into `job-preview.tsx`, add the "About" card / empty hint there; `JobEditor` gets `companyProfile: CompanyProfile | null`, loaded by `jobs/new/page.tsx` and `jobs/[jobId]/edit/page.tsx` with `getCompanyProfile`.
- **Shared public header:** move `PostingHeader` / `HeaderAccount` out of `src/app/jobs/[jobId]/page.tsx` into `src/components/public-header.tsx` (unchanged behaviour), used by both public pages.
- **`src/app/jobs/[jobId]/page.tsx`:** company name as a `Link` to `companyProfilePath(job.companySlug)`; the left column becomes the job card plus the "About" card (`getCompanyProfile(job.companySlug)` in `Posting`, shown when `hasCompanyDetails`).
- **New `src/app/companies/[slug]/page.tsx`:** as in The screens, with `generateMetadata`, the data in a Suspense boundary and the header account in its own (`connection()` there only).
- **`src/lib/companies/company.ts`:** add `"companies"` to `APP_ROUTES` and drop it from the extra words of `RESERVED_SLUGS` (the reserved set is unchanged, so `company_slug_valid` needs no new migration; `company.test.ts` keeps passing). `gateRedirect` then treats `/companies/...` as a public path with no change.

### 6. Tests (Vitest, `*.test.ts` next to the file)
The repo has no component render tests (node environment, no Testing Library); each new component's logic lives in a pure helper that is tested, as elsewhere in the repo. Existing tests are not edited, only added to.
- **`profile.test.ts`:** the schema (trim, CRLF, empty → null, each limit, `acme.com` → `https://acme.com`, `javascript:`/`ftp:`/no-dot host refused, unknown size refused); `toCompanyProfile` drops stray columns; `companyFacts`, `websiteLabel`, `hasCompanyDetails`, the paths and tag; `COMPANY_SIZES` equals the enum in the migration (read the file, as `company.test.ts` does for reserved slugs).
- **`text-fields.test.ts`:** the moved transform and message.
- **`profile-queries.test.ts`:** invalid slug → null and no RPC; a row is mapped; no row → null; an error throws; `cacheTag` gets `company:{slug}`.
- **`queries.test.ts`:** `getCompanyPublishedJobs` sends `p_company_slug`.
- **`profile/actions.test.ts`:** bad input touches nothing; employer only; the limit; exactly the five columns written for the session's slug (a slug in the form is ignored); zero rows → error; a DB error; `updateTag` only on success.
- **`route-gate.test.ts`:** `/companies/acme` passes for a guest, a candidate, an employer with and without a slug.
- **`sidebar-nav` helper:** `isNavItemActive` (Dashboard exact, Company profile by prefix).
- **`format.test.ts`:** `truncateText`.

### 7. Documentation
This document gets its status and verification results; [companies.md](./companies.md) ("Where this stands" row, "Later phases" 4), [account-types.md](./account-types.md) (routing table: `/companies/{slug}`, `/{slug}/profile`), [architecture.md](../project-overview/architecture.md), [security.md](../project-overview/security.md) (public RPC, column-level update grant, website scheme), [roadmap.md](../project-overview/roadmap.md).

## Verification
**Done:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. The build lists `/[company]/profile` and `/companies/[slug]` as partially prerendered, with no "Date.now() while prerendering" error.
- Breaking the new code on purpose, three times: `updateTag` removed from `saveCompanyProfile`, the name-and-password check removed from `normalizeWebsite`, and the slug check removed from `getCompanyProfile`. Each turned the suite red, and restoring the code turned it green again.
- **The catalog after `company_profiles.sql`:** the five columns, the enum with its six values, the four new checks, the owner-only UPDATE policy, UPDATE granted to `authenticated` on exactly those five columns, `published_job_postings` only as `(p_job_id, p_company_slug)`, both functions security definer and executable by `anon` and `authenticated`. The security advisors show only the expected new "SECURITY DEFINER executable" finding for `public_company_profile` (`published_job_postings` was flagged before).
- **As real users, in a `DO` block that ends with a deliberate exception (nothing kept), with the follow-up grant added inside the block:**
  - the owner updates the five profile columns: 1 row; `name`, `slug` and `owner_id`: refused (`42501`);
  - `javascript:alert(1)`, a website with a space, a 5,001-character description and an untrimmed industry: refused by the checks (`23514`); a size that is not in the enum: `22P02`;
  - a user who owns no company, and another company's owner, update this company: 0 rows;
  - `anon` reads `public_company_profile` and gets exactly `description, headquarters, industry, name, size, slug, website`, 0 rows for an unknown company, is refused a direct `select` on `companies` (`42501`), and can call `published_job_postings()` and `published_job_postings(null, slug)`.
  - **Without the grant, the first update fails** with `42501 permission denied for function company_slug_valid`. That is the bug the follow-up migration fixes; the database was checked afterwards and the grant is not in it.
- **In headless Chromium as a guest, read-only, against the production build (`next start`) and the real database:** `/companies/my-comp` (a company set up with an empty profile) shows its name as the heading, "Open positions (0)" and "No open positions right now.", no "About" card, and the header's Log in and Get started; an unknown slug, a reserved one (`jobs`) and an invalid one (`UPPER_case`) are the not-found page; an unknown `/jobs/{uuid}` is still not found; `/my-comp/profile` sends a guest to `/sign-in`; `/jobs` still lists jobs. No console or page errors. A dev server that had been running since before this work showed `getCompanyPublishedJobs is not a function` on the same page, and stopped doing so once it had recompiled: a stale module in that server, not the code.

- **The grant applied (`company_profile_slug_check.sql`), then checked on the real database as real users in a rolled-back block, with no extra grant inside it:** the owner saves the profile (1 row), renaming the company is refused (`42501`), `javascript:alert(1)` as a website is refused (`23514`), and `anon` can't update a company (`42501`). `authenticated` can now run `company_slug_valid()` and `anon` still can't.
- **Employer, candidate and guest in headless Chromium against the production build (`next start`) and the real database,** with two throwaway `@example.com` accounts made with the secret key and deleted afterwards (the counts of users, companies, jobs and applications were the same before and after: 102, 3, 5, 5). All 18 steps passed:
  - the employer signs in and lands on `/setup`, creates the company and lands on `/{slug}`; the sidebar has Company profile, with Dashboard current on `/{slug}` and on `/{slug}/jobs/new`, and only Company profile current on `/{slug}/profile`;
  - an empty profile shows the placeholder and `0 / 5,000`; typing fills the preview live, with the website link carrying `rel="noopener noreferrer nofollow ugc"`; `javascript:alert(1)` is refused with a field error and nothing typed is lost; Save stores the profile and says so, and a reload shows it (the website saved as `https://acme-check.com`);
  - the job editor's preview shows the "About" card; the employer creates a job and publishes it;
  - a guest sees the posting with the "About" card and a company link to `/companies/{slug}`, and the company page with the profile and "Open positions (1)", without the demo job; a candidate sees both too and is sent to `/dashboard` from the profile editor;
  - editing the profile shows on the posting and the company page at once (the cache expires), and a cleared profile takes the "About" card off the posting and gives the job editor's preview its invitation to write one.
- **Two things that looked like failures were not:** the first run of the script failed two steps because of races in the script (it checked the sidebar before it had streamed in, and mistook the "Profile saved." of the previous save for the current one); it was fixed to wait for the Server Action's own response and run again. The `ERR_SSL_PROTOCOL_ERROR` on `/setup` and `/dashboard` is the production build's `upgrade-insecure-requests` header on plain `http://localhost`, and those routes are not new.

**Still to do:** nothing for this feature. Commit, and push to `main` only when asked.

## Order of release (the database is shared between development and production)
1. `company_profiles.sql` and then `company_profile_slug_check.sql`, both applied. Both only add or grant, and `published_job_postings` is replaced by a compatible function, so the deployed code keeps working. **Both must be in the database before the code is deployed:** the profile pages read `public_company_profile`, and saving needs the grant.
2. Commit, then push to `main` (which deploys), only when asked.

## Out of scope
- A logo, cover image and brand colours (needs R2 uploads); changing the company name or slug.
- The company profile in the job board's side sheet (`src/components/jobs/job-description-sheet.tsx`), which already links to the posting.
- A directory of all companies (`/companies`), and a dashboard nudge to fill in the profile.
