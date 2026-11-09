# Feature: Company Names and Slugs

**Status:** Implemented in code; **the migration is applied** (by hand in the SQL editor, so it isn't in the migration history under a version of its own: `companies.slug`, `company_slug_valid()` and `set_up_company()` are in the database, checked 2026-11-09). One company has since set itself up through `/setup`. `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass, and seven deliberate breakages of the new code (reserved words allowed, `/jobs/{id}` redirected, no PDF check, files not deleted, a 404 no longer `null`, no session refresh, no cache expiry) each turned the suite red. **Not checked yet:** the SQL checks as real users and the Chromium run, see [Verification](#verification).

Every employer account still lands on `/test`: the company is a fixture in code (`TEST_COMPANY` in `src/lib/companies/company.ts`), and `companies.name` exists but nothing writes it. This gives each company its own name and its own address, `/{slug}`.

**Scope when asked to implement "the plan":** only this document. It is the first of three steps, done one at a time: this one, then [document-storage.md](./document-storage.md), then [apply-with-cv.md](./apply-with-cv.md).

## Decisions (agreed with the user, 2026-11-09)
- **Name and slug are chosen on a screen after activation,** `/setup`, not in the sign-up dialog. On their first visit to the employer side an employer types the company's name, and the slug is suggested from it ("Petrović d.o.o." → `petrovic`) and can be edited.
- **The slug is fixed once saved.** Changing it later would break links already shared.
- **The three existing companies have no slug,** so they go through the same screen on their next visit.
- **Rules:** 3 to 40 characters, `a-z`, `0-9` and `-`, no hyphen at either end. Not a reserved word: every top-level route in `src/app` (`jobs`, `dashboard`, `applications`, `saved-jobs`, `settings`, `sign-in`…) plus `setup`, `careers`, `admin`, `api`, `test`, `employer`, `help`, `pricing` and the like. A slug already taken answers "This address is taken."
- **The slug rides in the JWT,** as [companies.md](./companies.md) planned: `app_metadata.company_slug`, which only the secret key can change. Proxy and `homeFor` read it without asking the database.

## Where the code differs from the plan
- **The gating rules are one pure function,** `gateRedirect()` in `src/lib/auth/route-gate.ts`, with its own tests, and `src/proxy.ts` only calls it. Same rules as below.
- **`APP_ROUTES`** (`src/lib/companies/company.ts`) is the list of the app's top-level routes; `RESERVED_SLUGS` is those plus the other words. `company.test.ts` reads the folders of `src/app` (through route groups, skipping `[dynamic]` ones) and fails until each is in both lists. It also compares `RESERVED_SLUGS` with the list in the migration, so the two cannot drift.
- **A workspace path** is a path whose first segment looks like a slug and isn't an app route. A path with a dot (`/robots.txt`) never is, since it is a file from `public/`.
- **A guest on an unknown first segment** (`/foo`) now goes to `/sign-in`, where it used to see the not-found page. That follows from "any path whose first segment isn't a known route" being a workspace path. A signed-in employer on `/foo` still gets the not-found page, from `getCompanyOrNotFound()`.
- **`slugify()`** uses `normalizeText` (`normalize` in the plan is that function's name in `filter.ts`), after turning hyphens into spaces, because it drops hyphens. A name with no Latin letters (Cyrillic) gives an empty suggestion and the employer types the address.
- **`set_up_company()`** calls `ensure_employer_workspace()` for the company and its demo job, and checks the name (`22023`) and the slug (`23514`) itself before it writes, so the action can tell the two apart.
- **A refresh that fails** after the company is saved sends the employer back to `/setup`, which then offers Continue (`continueToCompany`). A `55000` from the RPC (set up on another device) does the same.
- **`/setup`** has its own dark layout, like the auth pages, with a Sign out button, so a wrong account is not a dead end. `AuthCard`'s footer is optional now.
- **`next.config.ts`** lost its `/employer` redirects: a signed-in employer on `/employer` or `/test` is sent home by `gateRedirect()`, and a guest to sign-in.

## Plan

### 1. Database: a new migration
- `companies.slug text unique`, with a check calling `public.company_slug_valid(text)`: the format and the reserved words (`immutable`, `search_path = ''`).
- A check on `companies.name`: trimmed, 1 to 100 characters.
- **RPC `set_up_company(p_name text, p_slug text)`,** `security definer`, `search_path = ''`, executable by `authenticated` only, in the pattern of `ensure_employer_workspace()` (`supabase/migrations/20261026210000_employer_jobs.sql`):
  - refuses a JWT that isn't an employer's;
  - makes the company and the demo job if there are none;
  - refuses a company that already has a slug (`55000`);
  - a taken slug is `23505`, a bad one `23514`.

### 2. The action and the screen
- **`setUpCompany`,** in the order the other actions use:
  1. zod;
  2. `requireAccountType("employer")`;
  3. rate limit, 10 an hour;
  4. the RPC;
  5. `supabaseAdmin.auth.admin.updateUserById(id, { app_metadata: { company_slug } })`. Supabase merges app_metadata, so `account_type` stays, as with `chooseAccountType`;
  6. `auth.refreshSession()`, so the session cookie carries a JWT with the slug;
  7. `redirect("/{slug}")`.
- **A company that has a slug while the JWT doesn't yet** (the refresh failed, or another device): `/setup` offers "Continue", which only updates the JWT and redirects.
- **New `src/app/setup/page.tsx`:** the name, the slug with its suggestion, and errors, in the auth cards' style.

### 3. Code
- **`src/lib/companies/company.ts`:**
  - `slugify()` uses `normalize` from `src/lib/jobs/filter.ts` and drops "d.o.o.", "doo", "llc", "gmbh";
  - `isValidSlug()`, `RESERVED_SLUGS`, `companyHome(slug)`;
  - `TEST_COMPANY` goes.
- **`src/lib/companies/get-company.ts`:** `getCompanyOrNotFound` reads `companies` by slug with the user's own client, wrapped in React `cache`. Row level security only shows the owner, so another company's slug or an unknown one is a 404.
- **`src/lib/auth/account-type.ts`:** `homeFor(type, companySlug)` answers `/{slug}` or `/setup` for an employer.
  - `getCurrentUser` gains `companySlug`.
  - The callers pass the slug from the claims: `dal.ts`, `proxy.ts`, `auth/confirm/route.ts`, `(auth)/actions.ts` and `mail.ts`.
- **`src/proxy.ts`:**
  - **A workspace path** is any path whose first segment isn't a known route.
  - **Gating:** a guest on a workspace path or `/setup` goes to `/sign-in`, and a candidate to `/dashboard`. An employer with no slug goes to `/setup`.
  - **Old addresses:** `/employer` and `/test` take a signed-in employer home. The redirects in `next.config.ts` go.
  - **`/jobs`** in `SIGNED_IN_REDIRECT_PATHS` becomes an exact match, so `/jobs/{id}` stays reachable for everyone ([apply-with-cv.md](./apply-with-cv.md)).
- **`src/app/(employer)/[company]/layout.tsx`:** no `generateStaticParams`. The params are runtime data, already read inside Suspense (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`, "Without generateStaticParams").
- **`src/app/(employer)/[company]/actions.ts`:** `redirect(companyHome(TEST_COMPANY))` becomes the slug from the session.

### 4. Tests (Vitest)
- **`company.test.ts`:** `slugify`, `isValidSlug`, and a test that reads the folders in `src/app` and checks that every route is in `RESERVED_SLUGS`.
- **`account-type.test.ts`:** `homeFor` with and without a slug.
- **`actions.test.ts`:** `setUpCompany`: bad input touches nothing, employer only, the limit, the error codes mapped, the JWT updated, the redirect.

### 5. Documentation
- This document gets a status and a verification section.
- [companies.md](./companies.md), [account-types.md](./account-types.md) (the routing table), [architecture.md](../project-overview/architecture.md), [security.md](../project-overview/security.md), [roadmap.md](../project-overview/roadmap.md).

## Verification
**Done:** `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` for the app as it was after this step (it passed, with `/setup` prerendered as a static shell). Breaking the new code on purpose turned the tests red each time (see Status).

**Done since:** `npm run build` together with the later steps, against the database with the migrations applied.

**Still to do:** the SQL checks and the Chromium run below.

**The checks to run:**
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. Break the new code on purpose once and watch the tests fail.
- **With SQL,** as real users in a `DO` block that ends with a deliberate exception:
  - the format, the reserved words and a taken slug are refused;
  - a slug can't be changed once set;
  - a candidate and `anon` can't call the RPC;
  - the security advisors show only the expected new "SECURITY DEFINER executable" finding.
- **In a headless Chromium against `next dev`,** with throwaway `@example.com` accounts deleted afterwards:
  - activation → `/setup` → `/{slug}`;
  - `/test` and `/employer` take an employer home; another company's slug is a 404;
  - a candidate and a guest on a slug go where the plan says;
  - an existing account with no slug goes to `/setup`.

## Order of release (the database is shared between development and production)
1. The migration (applied). It only adds columns, a check and a function, so the deployed code keeps working.
2. Commit, then push to `main` (which deploys), only when asked.

## Out of scope
- Changing a slug, and a company settings page.
- A logo and brand colours; the public careers page.
- More than one member per company.
