# Feature: Callback for Chrome (track jobs from LinkedIn, HelloWorld and Infostud)

**Status:** done, 2026-11-15, on the branch `feat/chrome-extension`; merged to main and pushed 2026-11-16, after the owner checked all three sites in Chrome (HelloWorld, Infostud, and LinkedIn signed in, with Easy Apply and with an application on the company's site). The Chrome Web Store listing is the owner's (`extension/STORE.md`; the store images are made outside git, in `extension/store-assets/`). The migration is **applied** to the Supabase project (2026-11-15, see Not done for the checks); the signed-in flow (form, Save, row, status, Remove) has not been run against a real account.
- **Done:**
  - **Shared rules** in `src/lib/external-jobs/`: `sources.ts`, `canonical-url.ts` (also `CANONICAL_URL_PATTERNS`, the regexes the migration's check constraints repeat, with `migration.test.ts` holding the SQL and the code together), `track-link.ts`, `track-query.ts` (`parseTrackQuery`, `trackNext`) and `add-schema.ts`; `linkedin`/`helloworld`/`infostud` in `sourceLabel()`.
  - **Sign-in return:** `candidateNext()` in `safe-next.ts`, used by `signIn`, `signUp`, `chooseAccountType`, `readPendingSignup`, the three auth components and the activation-email comment. `signInTarget()` in `route-gate.ts` (the proxy passes `trackNext` as the rule) gives the guest redirect `?next=`.
  - **Database:** `supabase/migrations/20261115120000_external_applications.sql` (the table, the `(id, user_id)` key on `candidate_cvs`, the composite foreign key with `on delete set null (cv_id)`, RLS, column grants, the 1,000-row trigger).
  - **Page and actions:** `/applications/new` (`page.tsx`, `AddExternalApplicationForm`, `InvalidTrackLink`, `AlreadyTracked`), `addExternalApplication`, `setExternalApplicationStatus` and `removeExternalApplication` (+ `external-actions.test.ts`), `getExternalApplications`, `findExternalApplication`.
  - **The list:** `ExternalApplicationItem`, `mergeApplications(manual, callback, external = [])`, `withCvFileNames`, `ExternalApplicationRow`, `RemoveExternalButton`, and the table's status and optimistic Remove for external rows (manual rows behave as before). `CvPicker` is extracted from `ApplyDialog` (415 to 368 lines; it is still over 300, as the plan didn't ask for more).
  - **Extension** in `extension/`: `manifest.json` (MV3, no `permissions`, no `host_permissions`, `minimum_chrome_version` 120), `src/content.ts`, `observe.ts` (MutationObserver, `popstate`, `hashchange` and the Navigation API, one run per frame), `sync-page.ts`, `button.ts` (closed shadow root, constructed stylesheet with a `<style>` fallback, link built by `buildTrackPath`, the fixed pill when there is no Apply control), `job-posting.ts` (reads JSON-LD with the scraper's walker), the three adapters with their selectors in ordered constants, the five fixtures, and `STORE.md`. The bundle is 20.7 KB, with no zod and no cheerio.
  - **Two protections beyond the plan:** after a move to another job inside the page the address changes before the page does, so an adapter reads nothing while the page's JSON-LD (HelloWorld, Infostud) or the job pane's own title link (LinkedIn) names another job; and a LinkedIn job page whose top-card classes have all changed falls back to the page's `<title>`, on `/jobs/view/` only. Infostud's JSON-LD title ends with " - Company" and that is cut.
  - **Scraper:** `scraper/extract/job-postings.ts` holds `collectPostings`, `jobPostingsFromScripts`, `hiringOrganizationName` and `postingPlace` (moved out of `json-ld.ts`, which imports them), with `job-postings.test.ts`. `postingPlace(value, { joinLocalityLists })` is off by default, so the scraper's output is unchanged; the extension turns it on for Infostud's `["Beograd"]`.
  - **Tooling:** `npm run icons` also writes `extension/icons/icon-{16,32,48,128}.png` (`--extension-dir`; the existing icons come out byte-identical), `npm run extension:build` and `extension:zip` (`scripts/build-extension.ts`, `scripts/extension/origin.ts`), `esbuild` 0.28.2 (the version `tsx` installs) and `happy-dom` as devDependencies, `extension/**/*.test.ts` in `vitest.config.mts`, `extension/dist` and `*.zip` ignored by git, ESLint and `tsconfig.json`.
  - **Docs and policy:** the Privacy Policy says what the extension reads and sends (see Deviations); `LEGAL_LAST_UPDATED` is "15 November 2026"; `features/legal-pages.md`, `features/applied.md` and `project-overview/roadmap.md` point here.
- **Checks:**
  - `npm test` 173 files, 1,646 tests pass (145 and 1,365 before; 28 new files, 281 new tests); `npm run lint` and `npx tsc --noEmit` pass; `npm run build` passes, and `/applications/new` is `◐` (partial prerender) with no `Date.now()` error, as `/applications` is.
  - Existing tests pass unchanged. Four existing test files got new tests appended and, where a new name was needed, an import added (`list.test.ts`, `safe-next.test.ts`, `route-gate.test.ts`, `types.test.ts`); no existing test was edited.
  - `npm run icons`, `npm run extension:build` and `npm run extension:zip` work. The zip holds `manifest.json`, `content.js` and `icons/` at its root (27.5 KB). `extension:zip` refuses a `CALLBACK_ORIGIN` other than https://callback.rs, and the build refuses `http://` anywhere but `localhost:<port>`.
  - On `npm start -p 3103`, signed out: `/applications/new?url=…&title=…&company=…&location=…` answers 307 to `/sign-in?next=%2Fapplications%2Fnew%3Furl%3D…` with every parameter intact; `/sign-in` and `/sign-up` carry it as a hidden `next` and keep it across the link between them. A `next` with another host, a look-alike host, `http:`, an extra parameter (`next`, `utm_source`), a repeated parameter, another path or no query is dropped (a plain `/sign-in`), and `/applications` and `/applications/new` with no query redirect to a plain `/sign-in`, as before.
- **Browser:** Playwright Chromium (`launchPersistentContext`, `--load-extension` of a `CALLBACK_ORIGIN=http://localhost:3103` build), the shadow root read through the DevTools protocol because it is closed.
  - **Live HelloWorld job** (`/posao/Fullstack-Developer/Proximus-d.o.o/766944`): the button sits under the "Apply Here" link, the href is `http://localhost:3103/applications/new?url=<canonical>&title=Fullstack+Developer&company=Proximus+d.o.o.`, `target="_blank"`, `rel="noopener noreferrer"`, shadow root `closed`. A real click opened a new tab at `http://localhost:3103/sign-in?next=…` with the parameters intact, and the HelloWorld tab stayed where it was.
  - **Live Infostud job** (`/posao/accounting-officer/slvwz-doo/765278`): the button is right of "Konkurišite" and the link carries title "Accounting Officer" (the JSON-LD's " - SLVWZ d.o.o." cut), company, and "Beograd, Srbija, RS". **In-app navigation**, with zero page loads: job, then the header's search link (no button on the list), then another job from the list (the button now names that job, with its own title, company and place), then back twice (the first job's button again, one host).
  - **Live LinkedIn guest page** (`/jobs/view/4463907148/`): the button is right of "Apply", with title, company "JetBrains" and "Belgrade, Serbia". LinkedIn's own sign-in modal dims it a few seconds after load.
  - **Signed-in LinkedIn fixture** served at `https://www.linkedin.com/jobs/view/4463907148/` and at `/jobs/search/?currentJobId=4463907148` through `context.route`: the button is after "Easy Apply" and not after "Save". After `history.pushState` to another `currentJobId` with the pane unchanged, the button goes; once the pane is redrawn it follows the new job; with no job open it is gone.
  - No error or warning from `chrome-extension://` on any page, and no duplicate host. The one `pageerror` on the LinkedIn guest page ("Cannot read properties of null (reading 'addEventListener')") is LinkedIn's own: the same page without the extension throws it too. I hid the sites' cookie banners in the private profile before the screenshots (a style on the element; nothing was clicked or sent to the sites).
  - Screenshots, in `/private/tmp/claude-501/-Users-milancakic-Documents-projects-CV-tracker-job-manager/52c07c68-dbac-4136-8220-e7d49ca55bcd/scratchpad/extension/shots/`: `helloworld-button.png`, `helloworld-page.png`, `infostud-button.png`, `infostud-page.png`, `infostud-after-navigation.png`, `linkedin-guest-button.png`, `linkedin-guest-page.png`, `linkedin-signed-in-button.png`, `linkedin-signed-in-page.png`, `after-click-sign-in.png`.
- **Deviations:**
  1. **`track-link.ts` is two modules.** `track-link.ts` (constants, `cleanLinkText`, `capText`, `buildTrackPath`) has no zod and is what the extension bundles; `track-query.ts` (`parseTrackQuery`, `trackNext`, `jobUrlSchema`) has the zod. One file would have put zod in a content script that runs on every LinkedIn job page. `add-schema.ts` is a third module for the action's schema and messages, because a `"use server"` file may export only async functions.
  2. **The Privacy Policy has no 13th numbered part.** The extension's statements are a block in "What we collect" (`ExtensionData`, with a bullet under Candidates) and a line in "How long we keep it". A new part would have changed "twelve numbered parts" and the part numbers the texts refer to (4, 5, 8, 9), which their existing tests hold. The statements are the ones the plan lists; new tests cover them.
  3. **Remove uses `refresh()`, not `revalidatePath("/applications")`,** as every other action here does for a dynamic page (`revalidatePath` in a Server Function also refreshes every page visited).
  4. **A deleted CV and no CV look the same** (the row shows no CV): `on delete set null (cv_id)` leaves nothing to tell them apart, so the plan's "says 'CV deleted'" is not shown; "the CV's name, or nothing" is.
  5. **`setPendingSignup` leaves out a `next` over 1,500 characters** (new `pending-signup.test.ts`). The extension's link carries a title, company and place that can run long in percent-encoded Serbian letters, and a cookie over about 4 KB is dropped by the browser without a word, which would lose the sign-up dialog.
  6. **HelloWorld's apply control** is found by what it is (`a.apply-btn` / `__ec-job-apply-button` / a link to `/konkurs/<id>`), then by its words ("Prijavi se", "Apply Here", "Apply") outside the header and never a link to `/prijava`. The page saved today says "Apply Here", not the plan's "Prijavi se".
  7. **`gateRedirect` is unchanged.** The `?next=` is added by a new pure `signInTarget(destination, requested, returnTo)` in `route-gate.ts`, with the rule passed in (`trackNext`) as AGENTS.md asks.
  8. **The LinkedIn country sites are not matched.** A visitor who is signed out in Serbia can be served `rs.linkedin.com` (its own canonical link says so), where the button does not appear: the plan names `www.linkedin.com` only. Adding a host is one line in `sources.ts` and one in the manifest, and a decision about wider access.
- **Not done:**
  - **The migration is applied** to the Supabase project, 2026-11-15, at the owner's request, as `external_applications` (Supabase's own migration history names it by its apply time, as with the earlier ones). Production runs Postgres 17.11, so `on delete set null (cv_id)` holds. Checked on the live database: RLS on; the four policies (select, insert, update, delete); the constraints, including `external_applications_url_shape`, the `(cv_id, user_id)` foreign key with `ON DELETE SET NULL (cv_id)` and `unique (user_id, url)`; `candidate_cvs_id_user_key`; `authenticated` holds SELECT and DELETE, INSERT on the seven columns and UPDATE on `status` only, `anon` nothing; the limit trigger. A rolled-back probe insert as the `authenticated` role, for a user id that doesn't exist, passed the trigger, RLS and the check constraints and stopped at the `auth.users` foreign key, so nothing was written (the table has 0 rows). The security advisor reports nothing about the new table.
  - **The signed-in flow** (form, Save, the row in `/applications`, status change, Remove) is covered by the action and component tests only, not run against an account. `/applications/new`'s form and the new row have not been looked at in a browser.
  - **LinkedIn's real signed-in page** is not checked: the fixture is written from the structure it is known to have.
  - **The store:** the developer account, the listing, the store screenshots and the review are the owner's. Nothing is committed, merged or pushed; the owner decides when.

## Context
Candidates apply on LinkedIn, HelloWorld and Infostud too. Those applications are invisible to Callback: `/applications` only holds jobs from our own board. The manual tracker (`public.applications`) needs a `public.jobs` row, and only the service role can write one. `features/applied.md` lists "applications for jobs that aren't in `public.jobs`" as out of scope, and `project-overview/roadmap.md:65` has "a browser extension" as still open.

The goal is a Chrome extension that puts an **"Add to Callback"** button next to each site's Apply button. One click opens callback.rs, where the signed-in candidate:
- checks the job's title and company (read from the page),
- picks the CV they used,
- picks a status,
- saves.

The job then appears in `/applications` with the same status dropdown as the other rows, even though it isn't on our board.

Decisions agreed with the owner (2026-11-15):
- **Distribution:** store-ready (manifest, icons, no extra permissions, a zip, the listing text), but loaded unpacked for now. Publishing is the owner's step.
- **CV:** optional. The list of their CVs, plus "No CV", plus Upload. Preselected when they have exactly one.
- **Remove:** jobs added from the extension can be removed from the list, after a confirmation. Other rows don't change.

## How it works, and why it is safe
1. **The extension reads the page and nothing else.**
   - A content script, only on the three sites, finds the job and adds a link-styled button.
   - It needs **no Chrome permissions**: no `tabs`, `cookies`, `storage`, background worker or `host_permissions`. Only `content_scripts.matches`.
   - It holds no token, sees no Callback cookie and calls no Callback API.
2. **The button is a plain link that opens a new tab:** `https://callback.rs/applications/new?url=…&title=…&company=…&location=…`. It is an `<a target="_blank" rel="noopener noreferrer">`, rebuilt whenever the page's job changes.
3. **callback.rs decides who you are,** with its own first-party session cookie, which is `SameSite=Lax` and so arrives on a top-level tab.
   - Signed out: you go to `/sign-in?next=<that address>` and come back to it after signing in or signing up.
   - Employer account: you go to your own home (`requireAccountType("candidate")`).
4. **Opening the page never writes anything.** A row is created only when the candidate presses **Save**, which is a Server Action protected by Next's Origin check. A hostile site that links to `/applications/new` can at most fill in a form the candidate still has to submit. This is the pattern of `src/app/interviews/[invitationId]/page.tsx`.
5. **Everything in the URL is untrusted.** The server re-validates and re-canonicalises it:
   - https only, and one of the three hosts;
   - the job's address is reduced to its canonical form;
   - the `source` is derived from the host, never taken from a parameter;
   - lengths are capped.
6. **The database enforces the same rules,** because a candidate's JWT can reach PostgREST directly:
   - RLS limits every row to its owner;
   - check constraints cover the source, the URL's shape per source, and the lengths;
   - a composite foreign key means a row can only point at the candidate's **own** CV;
   - a per-user row limit.
7. **No page data reaches the page as HTML.** The button lives in a closed shadow root and is filled with `textContent`. Its link is built with `URL` and `URLSearchParams`.

## Shared rules: `src/lib/external-jobs/` (plain modules, used by the server and bundled into the extension)
- **`sources.ts`:**
  - `EXTERNAL_SOURCES = ["linkedin", "helloworld", "infostud"]`;
  - each source's host (`www.linkedin.com`, `www.helloworld.rs`, `poslovi.infostud.com`) and its label;
  - `externalSourceOf(url)`.
  Add `linkedin` / `helloworld` / `infostud` to `SOURCE_LABELS` in `src/lib/jobs/types.ts` (LinkedIn, HelloWorld, Infostud), so `sourceLabel()` works for them.
- **`canonical-url.ts`, `canonicalJobUrl(input)`.** It returns `{ source, url }` or null:
  - **LinkedIn:** the job id from `/jobs/view/<id>` or `?currentJobId=<id>` becomes `https://www.linkedin.com/jobs/view/<id>/`.
  - **HelloWorld:** `/posao/<title>/<company>/<id>` becomes `https://www.helloworld.rs/posao/…/<id>`.
  - **Infostud:** `/posao/<slug>/<company>/<id>` becomes `https://poslovi.infostud.com/posao/…/<id>`.
  - For all three: no query, no hash, no credentials, https only.
- **`track-link.ts`:**
  - `TRACK_PATH = "/applications/new"` and the limits (`TITLE_MAX = 200`, `COMPANY_MAX = 200`, `LOCATION_MAX = 200`).
  - `buildTrackPath(job)` builds the path and query, and `parseTrackQuery(searchParams)` checks it with a zod schema. The URL is required and must canonicalise. Title, company and location are optional (the extension may miss one), trimmed and capped, with control characters removed.
  - `trackNext(next)` returns the path rebuilt from the parsed query, or null. It accepts the path exactly, only the known parameters, and nothing else.
- Each module has a `*.test.ts`. Cover good and bad hosts, `http:`, `javascript:`, credentials, look-alike hosts (`linkedin.com.evil.rs`), extra parameters, over-long values, and a round trip of `buildTrackPath` → `parseTrackQuery`.

## Database: `supabase/migrations/<timestamp>_external_applications.sql`
- **On `public.candidate_cvs`:** `add constraint candidate_cvs_id_user_key unique (id, user_id)`.
- **`public.external_applications`:**
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null default auth.uid() references auth.users on delete cascade`
  - `source text not null check (source in (…))`
  - `url text not null`, with a check that it matches the canonical shape for its `source`
  - `title`, `company_name`: 1–200 characters
  - `location`: null or 1–200 characters
  - `cv_id uuid`, with `foreign key (cv_id, user_id) references candidate_cvs (id, user_id) on delete set null (cv_id)`. Deleting a CV keeps the row and says "CV deleted". Check the project's Postgres is 15 or newer, which column-list `set null` needs.
  - `status public.application_status not null default 'PENDING'` (the existing enum)
  - `applied_at timestamptz not null default now()`
  - `unique (user_id, url)`
- **RLS** (`user_id = (select auth.uid())`), mirroring `20261023100000_applications_status.sql`:
  - select, insert (with check), update and delete policies;
  - `grant select, insert (source, url, title, company_name, location, cv_id, status), update (status), delete … to authenticated`.
  - If the existing candidate policies check the account type, mirror that too.
- **A limit trigger:** 1,000 rows per user, errcode `54000`, like `candidate_cvs_limit`.
- **Applying it to the Supabase project is an outward step.** Ask the owner first. The migration must be live before the deploy that uses it.

## The page on callback.rs: `/applications/new`
- **Routing (no new top-level route, so no `APP_ROUTES` or slug migration):**
  - `/applications` is already a candidate prefix (`src/lib/auth/route-gate.ts`).
  - `src/proxy.ts` `redirectWithCookies` drops the query today. When the gate's target is `/sign-in` and `trackNext(pathname + search)` (or `postingNext`) accepts the original address, append `?next=<it>`.
  - Add `route-gate`/proxy tests for this case.
- **Sign-in return:** add `candidateNext(next) = postingNext(next) ?? trackNext(next)` in `src/lib/auth/safe-next.ts`, and use it where `postingNext` is used today:
  - `signIn`, `signUp` and `chooseAccountType` (`src/app/(auth)/actions.ts`);
  - `readPendingSignup` (`src/lib/auth/pending-signup.ts:52`);
  - the activation link (`src/lib/mail.ts`);
  - `sign-in-form.tsx`, `sign-up-form.tsx` and `keep-next-link.tsx`.
  Existing `postingNext` tests stay as they are; new tests cover `candidateNext`.
- **`src/app/(app)/applications/new/page.tsx`:**
  - `metadata`: title "Add an application | Callback", `robots: noindex` and `referrer: "no-referrer"`.
  - The body sits in Suspense with `connection()`, as on `applications/page.tsx`, so there is no `Date.now()` at prerender.
  - It runs `requireAccountType("candidate")`, then `parseTrackQuery(searchParams)`, which leads to one of three views:
    - **Invalid:** "This link doesn't point to a job we can add", with a link to `/applications`.
    - **Already tracked** (a select by the canonical URL): "Already in your applications", its status, and a link.
    - **Otherwise** the form, with `getMyCvs()` for the CVs.
- **`src/components/applications/add-external-application-form.tsx`** (client, `useActionState`), with these fields:
  - Title and Company: prefilled and required.
  - Location: optional.
  - The job link: read-only, showing the site's label and opening in a new tab.
  - The CV picker.
  - `StatusSelect` (`src/components/applications/status-select.tsx`), default Pending.
  - Save.
  Split it if it passes 300 lines.
- **CV picker, extracted, not copied:**
  - Move the inline radio list from `ApplyDialog` (`src/components/jobs/apply-dialog.tsx:214-251`) into `src/components/cvs/cv-picker.tsx`. Its props are `{ cvs, value, onChange, allowNone?, onUploaded, onError }`, and it uses `CvUploadButton`.
  - `ApplyDialog` uses it with the same markup, and its existing tests pass unchanged. It drops from 415 lines.
- **Server Action `addExternalApplication(prev, formData)`** in `src/app/(app)/applications/actions.ts`:
  1. zod, through `parseTrackQuery`'s rules plus `cvId` (uuid or empty) and `status` (`z.enum(APPLICATION_STATUSES)`);
  2. `requireAccountType("candidate")`;
  3. `rateLimit({ key: "external-application:<id>", limit: 30, windowMs: 1h, store: postgresStore })`;
  4. insert with the user's own `createClient()`, so RLS applies;
  5. map `23505` to "Already in your applications", `23503` to "That CV is no longer on your account", and `54000` to the limit message;
  6. on success, `redirect("/applications")`.

## The list: `/applications`
- **`src/lib/applications/types.ts`:** add `ExternalApplicationItem { kind: "external", id, source, status, appliedAt, title, companyName, location, url, cvId, cvFileName }` to `ApplicationListItem`.
- **`src/lib/applications/queries.ts`:** add `getExternalApplications(userId)`. The page maps `cvFileName` from `getMyCvs()`, because `candidate_cvs` has no client select.
- **`src/lib/applications/list.ts`:**
  - `mergeApplications(manual, callback, external = [])`: the third parameter is optional, so existing tests don't change.
  - `itemKey` gives `external:<id>`.
  - `isOpenItem` is true for external rows.
  - `statusRank` uses `MANUAL_RANK`.
- **`applications/page.tsx`:** loads all three in its `Promise.all`.
- **`src/components/applications/external-application-row.tsx`** (new):
  - the title links to `url` (`_blank`, `noopener noreferrer`);
  - the company, with a muted "via LinkedIn" (`sourceLabel`);
  - the CV's name linking to `cvUrl(cvId)`, or nothing;
  - `StatusSelect`;
  - a **Remove** button with a confirm dialog, following `withdraw-button.tsx`.
- **`applications-table.tsx`:** routes the status change by `kind`. External rows call `setExternalApplicationStatus` and keep their optimistic state under their `itemKey`; manual rows behave exactly as now. Removing a row hides it optimistically and brings it back with an error if the action fails.
- **New actions in the same `actions.ts`:**
  - `setExternalApplicationStatus(id, status)`: `z.uuid()`, `z.enum`, 60 per minute, 0 rows → "Application not found.".
  - `removeExternalApplication(id)`: 20 per minute, 0 rows → "Application not found.". Then `revalidatePath("/applications")`.

## The extension: `extension/`
- **`manifest.json` (MV3):**
  - `name` "Callback", `version` "0.1.0", and a description;
  - icons 16, 32, 48 and 128;
  - `content_scripts`: `matches` `https://www.linkedin.com/jobs/*`, `https://www.helloworld.rs/*` and `https://poslovi.infostud.com/*`, `js: ["content.js"]`, `run_at: "document_idle"`;
  - **no** `permissions` and no `host_permissions`.
- **`src/content.ts`:** picks the adapter by `location.hostname`, then runs `observe.ts`, a `MutationObserver` plus a URL-change check, throttled to one run per animation frame. All three sites change the job without a page load (Infostud is a Next.js app; LinkedIn's search list swaps the job pane). On every run it reads the job and mounts, updates or removes the button.
- **`src/button.ts`:**
  - Mounting: the button is an `<a>` in a closed shadow root, placed right after the site's Apply control, and it takes that control's height. If the job is found but no Apply control is, it falls back to a small pill fixed at the bottom right, so a site's redesign doesn't hide it silently.
  - Look and text: the styles come from a constructed `CSSStyleSheet` (`adoptedStyleSheets`, which the page's CSP doesn't block; check this on each site). The label is "Add to Callback".
- **`src/sites/types.ts`:** `SiteAdapter { source, isJobPage(url), readJob(doc, url): ScrapedJob | null, findApplyControl(doc): Element | null }`. Each site keeps its selectors in one ordered constant, so a site change is a one-line fix.
  - **`linkedin.ts`:**
    - The job id comes from `/jobs/view/<id>` or `currentJobId`.
    - Signed in: title and company from the job pane's top card (`.job-details-jobs-unified-top-card__job-title` and `__company-name`, plus older `jobs-unified-top-card__*` fallbacks). The Apply control is `.jobs-apply-button` / `.jobs-s-apply button`.
    - Signed out (the guest page): JSON-LD, then `.topcard__title` / `.topcard__org-name-link`.
  - **`helloworld.ts`:** the job page `/posao/…/<id>`.
    - Job data comes from JSON-LD `JobPosting` (`title`, `hiringOrganization.name`, `jobLocation`; checked: present on today's pages, with `link[rel=canonical]`).
    - The Apply control is the job's "Prijavi se" button, scoped to the job. The header's "Prijavi se" is the login link (`/prijava`) and must not match.
  - **`infostud.ts`:** the job page `/posao/…/<id>`.
    - Job data comes from JSON-LD (checked: `JobPosting` with `hiringOrganization.name`) and `link[rel=canonical]`.
    - The Apply control is "Konkurišite".
- **`src/job-posting.ts`:** reads `script[type="application/ld+json"]` from the `Document` and uses a **shared, cheerio-free walker**. Move `collectPostings` out of `scraper/extract/json-ld.ts` into `scraper/extract/job-postings.ts`, next to the existing pure `scraper/extract/json.ts` helpers, and add `hiringOrganizationName(posting)`, which no code reads today. `json-ld.ts` imports it; its existing tests pass unchanged.
- **`extension/STORE.md`:**
  - the store listing (short and long description);
  - the single-purpose statement;
  - why it needs access to the three sites;
  - the data-use answers (it reads the job on the page and sends it only when you click; nothing to third parties);
  - the privacy policy URL `https://callback.rs/privacy`;
  - screenshots to take.
- **Icons:** `scripts/generate-app-icons.ts` gets `--extension-dir` (default `extension/icons`) and writes 16, 32, 48 and 128 px transparent PNGs. It uses the existing `cleanLogo` and the `any` scale. The PNGs are committed, like the app icons.
- **Build:** `scripts/build-extension.ts`.
  - `npm run extension:build` bundles `extension/src/content.ts` with esbuild (iife, target chrome120) into `extension/dist/` and copies the manifest and icons.
  - The origin comes from `CALLBACK_ORIGIN` (default `https://callback.rs`; only https, or `http://localhost:<port>` for a dev build), injected with `define`.
  - `npm run extension:zip` writes `extension/callback-extension-<version>.zip` for the store, using the system `zip`.
- **Tooling:**
  - add `esbuild` as a devDependency, pinned to the version `tsx` already installs, and `happy-dom` for the DOM tests;
  - add `extension/**/*.test.ts` to `vitest.config.mts`'s `include`;
  - ignore `extension/dist` and `*.zip` in `.gitignore`, ESLint and `tsconfig.json` `exclude`.
- **Tests:**
  - **Each adapter** (`// @vitest-environment happy-dom`), on trimmed real-page fixtures in `extension/src/sites/__fixtures__/`. For HelloWorld, Infostud and LinkedIn's guest page, save them from the live public pages. For signed-in LinkedIn, write one from its known structure. Each test checks: the job is read, the Apply control is found, a non-job page returns null, and the header login link isn't taken.
  - **`button.test.ts`:**
    - mount, update and unmount;
    - no duplicate on a second run;
    - the href equals `buildTrackPath` under the origin;
    - page text with `<script>` arrives as text;
    - the fallback pill.
  - **`manifest.test.ts`:**
    - MV3 with no `permissions` or `host_permissions`;
    - `matches` equal to the hosts in `sources.ts`;
    - every icon exists at its size (`scripts/app-icons/png-size.ts`).
  - **The build script's origin check.**

## Privacy policy, docs
- **`/privacy`:** a section "The Callback browser extension":
  - what it reads (title, company, location and address of the job page you're on);
  - when it sends it (only when you click, as the address of a callback.rs page);
  - that it has no other permissions, no tracking and no third parties;
  - that added jobs are stored with your applications and can be removed.
  Also add "jobs you add from other sites" to "What we collect". `LEGAL_LAST_UPDATED` becomes the implementation date, and new tests cover the new statements. Update `features/legal-pages.md` with it.
- **Other docs:**
  - `features/chrome-extension.md` (this plan, then its Status);
  - `features/applied.md` (the out-of-scope line now points to it);
  - `project-overview/roadmap.md:65`.

## Verification
1. **The usual checks:**
   - `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build`;
   - `/applications/new` builds without the `Date.now()` prerender error;
   - `npm run icons`, `npm run extension:build` and `npm run extension:zip` succeed.
2. **The extension in Chromium** (Playwright `launchPersistentContext` with `--load-extension=extension/dist`, from a dev build where `CALLBACK_ORIGIN=http://localhost:3103`):
   - On a live public HelloWorld job page, an Infostud job page and a LinkedIn guest job page: the button sits next to Apply, its href holds the right canonical URL, title and company, there are no console errors, and there are screenshots.
   - The signed-in LinkedIn fixture is served under a real `linkedin.com/jobs/view/…` URL through `context.route`: same checks.
   - An Infostud in-app navigation to another job updates the button.
3. **Callback, on a production build (`npm start -p 3103`), signed out:**
   - `/applications/new?url=…` redirects to `/sign-in?next=…` with the parameters intact;
   - a tampered `next` (another host, another path, extra parameters) is dropped;
   - `/applications` still redirects as before.
4. **The signed-in path** (form → Save → row in `/applications` → status change → Remove) is covered by the action and component unit tests. Creating real rows needs the migration and an account. Ask the owner before applying the migration or signing into any account; otherwise this is the owner's check after deploy, along with the live signed-in LinkedIn page.
5. Nothing is committed, merged or pushed until the owner asks. A push to main deploys to callback.rs.

## Fix, 2026-11-16: LinkedIn's new job page
**Status:** implemented, 2026-11-16, and checked by the owner on the real page.
- **Tightened in review:** the label rule first took any label starting with the word "Apply", which would also take the search's filter controls ("Apply current filter to show 1,234 results", a bare "Apply"). Those come before the job's pane in the page. It is now `/^(?:easy\s+apply|apply\s+(?:to|on|now))\b/i`. A new test puts filter controls before "Easy Apply to this job" and expects the job's control. In the list test, written in this same fix, "APPLY" became "APPLY NOW" and "Apply to … on company website" was added. After that: `npm test` 173 files and 1,665 tests pass, lint and tsc are clean, `extension/dist` is rebuilt for `http://localhost:3000`, and the Playwright check passes again (one button, after the first Easy Apply, the expected href, no console errors).
- **Changed:**
  - `extension/manifest.json`: LinkedIn matches `https://www.linkedin.com/*`, the other two as before; `manifest.test.ts`'s rule now says that.
  - `extension/src/sites/linkedin.ts`: the tab-title fallback runs on every address `canonicalJobUrl` accepts, and `#jobs-apply-button-id` and then the first `button[aria-label]` or `a[aria-label]` that starts with "Easy Apply" or "Apply" (a word, any case) follow the known selectors.
  - `extension/src/dom.ts`: a new shared helper, `firstElementByLabel`, with tests in `dom.test.ts`.
  - New fixture `linkedin-signed-in-2026.html`, with adapter tests, and `syncPage` tests that mount the real button on it (after the first "Easy Apply" only) and clear it on `/feed/`.
  - `extension/STORE.md`: the access justification names LinkedIn's whole host and says the script shows nothing on a LinkedIn page that isn't a job's.
- **Checks:**
  - `npm test`: 173 files, 1664 tests passed (the extension's 12 files: 124).
  - `npm run lint`: clean. `npx tsc --noEmit`: clean.
  - `CALLBACK_ORIGIN=http://localhost:3000 npm run extension:build`: `extension/dist` is built with that origin, for the owner to reload.
  - Playwright Chromium, with `extension/dist` loaded and the fixture served at `https://www.linkedin.com/jobs/search-results/?currentJobId=4472623882&keywords=x` through `context.route` (no live linkedin.com; requests to localhost:3000 were aborted in the route, never sent): one button, mounted right after the first "Easy Apply" and not after the second; clicking it opened `http://localhost:3000/applications/new?url=https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F4472623882%2F&title=Full+Stack+Software+Developer&company=Employer.com`; no console errors or warnings.
- **Deviation:** one existing test had to change, because the plan reverses what it asserted. "does not use the page's title in the search, which names the search and not the job" expected null for a `/jobs/search/?currentJobId=…` address with the top-card classes gone; the plan now reads the tab's title there, so it asserts that job instead (the title, the company and a null location). No other existing test changed. `STORE.md` was edited, which the plan didn't list.
- **Risk, not in the plan:** the "Apply" label rule would also take another control whose label starts with the word, such as "Apply filters", if one comes before the job's in the page.

**What the owner saw.** HelloWorld and Infostud work, but on LinkedIn (signed in) there is no button and no fallback pill. A read-only check in the console on the job page gave these facts:
- **Address:** `https://www.linkedin.com/jobs/search-results/?currentJobId=4472623882&keywords=…`. `canonicalJobUrl` already reads `currentJobId` there.
- **The tab's title:** `Full Stack Software Developer | Employer.com | LinkedIn`.
- **No class the adapter knows is on the page.** `.job-details-jobs-unified-top-card__job-title` and `__company-name` are both null, and `.jobs-apply-button` is absent.
- **No `h1` either.** The headings are `h2` with hashed classes (`k4dlje k4dlo7 …`): "About the job", "About the company". Hashed classes change with every LinkedIn deploy, so no selector may rely on them.
- **The apply controls** carry `aria-label="Easy Apply to this job"` (two on the page).

**The cause.** LinkedIn's new jobs page has none of the top-card classes. So `readJob` finds no title, and with no job there is no button, and no pill either. The tab-title fallback runs only on `/jobs/view/`. A second cause is likely too: the content script matches only `https://www.linkedin.com/jobs/*`, so a member who goes from the feed to Jobs inside LinkedIn's single-page app gets no script until they reload.

**The change:**
1. **`extension/manifest.json`:** LinkedIn matches `https://www.linkedin.com/*`; HelloWorld and Infostud are unchanged. The adapter's `isJobPage` still decides where a button appears; on any other page, `syncPage` only clears it. Still no `permissions` and no `host_permissions`. `manifest.test.ts`'s rule becomes "LinkedIn host-wide, the other two as before".
2. **`extension/src/sites/linkedin.ts`, the title and company:**
   - The tab-title fallback (`(N) Title | Company | LinkedIn`) applies to every LinkedIn job address `canonicalJobUrl` accepts (`/jobs/view/…` and any page with `currentJobId`), not only `/jobs/view/`. The top-card and guest selectors are still tried first.
   - A tab title that isn't three parts ending in "LinkedIn" (for example "Jobs | LinkedIn") gives no job.
   - The location is null when only the tab title is known.
3. **`extension/src/sites/linkedin.ts`, the apply control:**
   - After the existing selectors, try `#jobs-apply-button-id`.
   - Then try the first `button` or `a` whose `aria-label` starts with "Easy Apply" or "Apply" (case-insensitive, as a word), such as "Easy Apply to this job" or "Apply on company website".
   - Our own button sits in a closed shadow root, so it is never matched.
4. **Tests:**
   - A new fixture, `extension/src/sites/__fixtures__/linkedin-signed-in-2026.html`, is built from the facts above: hashed classes, no `h1`, the `<title>`, two `aria-label="Easy Apply to this job"` buttons, and the "About the job" `h2`.
   - Adapter tests on the address above: the job read from the tab title, the apply control found by its label, and no job for a "Jobs | LinkedIn" title.
   - `syncPage` mounts the button after the first "Easy Apply".
   - The existing fixtures still pass.
5. **Known limit:** right after a move to another job, the tab's title could for a moment still be the previous job's. The confirm page shows the title and company prefilled and editable, so the candidate sees it before saving.

**Checks:**
- `npm test`, `npm run lint` and `npx tsc --noEmit`.
- `CALLBACK_ORIGIN=http://localhost:3000 npm run extension:build`, which the owner then reloads.
- In Playwright Chromium, the new fixture served at the real address through `context.route`: the button sits after "Easy Apply" with the right href. The owner checks the real page.

## Fix 2, 2026-11-16: the LinkedIn button is mounted but hidden
**Status:** implemented, 2026-11-16, and checked by the owner on the real page ("sve radi").
- **Changed:**
  - `extension/src/dom.ts`: `outermostSameBoxWrapper(element, maxDepth = 4)`, as planned, with tests in `dom.test.ts` (10: a same-size chain, a few pixels larger, a wider parent, a taller or smaller one, no wrapper, no layout, an empty box, `maxDepth`, `body` and `html`, no parent).
  - `extension/src/sites/linkedin.ts`: `findApplyControl` returns `outermostSameBoxWrapper(control)`, for the known selectors, the id and the label alike.
  - New fixture `extension/src/sites/__fixtures__/linkedin-signed-in-external-apply.html`: the facts above, a clipping wrapper (`overflow: hidden`, inline-flex, 168 by 48 px, the link filling it) and a Save button beside it. Adapter tests (6, in `linkedin.test.ts`) and `syncPage` tests (4, in `sync-page.test.ts`: the host is the wrapper's next sibling and not inside it, the wrapper's height, no duplicate, the old placement without layout).
  - New test helper `extension/src/test-support/layout.ts`, `giveBox(element, width, height)`, because happy-dom has no layout.
- **Checks:**
  - `npm test`: 173 files, 1685 tests passed (1665 before; the extension's 12 files: 145). The three new adapter and `syncPage` tests fail with the wrapper step taken out, which is checked.
  - `npm run lint`: clean. `npx tsc --noEmit`: clean.
  - `CALLBACK_ORIGIN=http://localhost:3000 npm run extension:build`: `extension/dist` is built with that origin, for the owner to reload.
  - Playwright Chromium, `extension/dist` loaded, both fixtures served at their real LinkedIn addresses through `context.route`, every other request aborted (requests to localhost:3000 never left the browser):
    - **Before the fix, the external-apply fixture:** one host, inside the wrapper after the `<a>`, 138 by 48 px at x=196 beyond the wrapper's right edge (24 to 192); `document.elementFromPoint` at its centre returned the Save button, and a real mouse click there opened no tab. The button was hidden, as the owner saw. The Easy Apply fixture was fine.
    - **After the fix:** the host is the wrapper's next sibling, in the row between Apply and Save; `elementFromPoint` at its centre returns the host; a mouse click there opens `http://localhost:3000/applications/new?url=https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F4431674043%2F&title=Frontend+Engineer+%26+UI+Designer+%28Developer+Tooling%29&company=SearchApi`. On the 2026 Easy Apply fixture: one host right after the first "Easy Apply", visible, with the same href as before. No console errors or warnings on either.
- **Deviations:**
  - The helper counts a parent as the same box when it is within 4 px either way, not only "no more than 4 px larger", so a parent clearly smaller than the control isn't taken. Every parent is compared with the control's own box, not the previous wrapper's.
  - The fixture's wrapper has a fixed size. An auto-sized inline-flex wrapper would grow to hold the host and so would not clip it.
  - The Playwright check clicks with the real mouse at the host's centre: `locator.click` succeeded even on the hidden host in the before-run, so it proved nothing.
  - `giveBox` is new and not in the plan.

**What the owner saw.** After the first fix, a job with an external application ("Apply ↗", "Responses managed off LinkedIn") showed no Callback button. There is a thin violet edge on the right of LinkedIn's Apply button, where ours should be. A read-only check on the page found:
- **The address:** `/jobs/search-results/?currentJobId=4431674043&…`.
- **The tab's title:** `Frontend Engineer & UI Designer (Developer Tooling) | SearchApi | LinkedIn`.
- **Our button:** `callbackButton: "inline"`, so the job was read and the button was mounted next to the control.
- **The apply control:** one `A`, with `aria-label="Apply on company website"`, text "Apply", and an `href` to `https://www.linkedin.com/safety/go/?url=…`.

**The cause.** The button is inserted as the next sibling of the `<a>`, but LinkedIn wraps that `<a>` in an element of the same size that clips or stacks its children. So the button ends up inside the wrapper, hidden behind LinkedIn's own. The first Easy Apply job most likely had the same problem.

**The change (LinkedIn only; HelloWorld and Infostud are checked and stay as they are):**
1. **A new helper in `extension/src/dom.ts`, `outermostSameBoxWrapper(element, maxDepth = 4)`:**
   - It walks up from the element while the parent's box is the same as the element's: both have a width and height above 0, and the parent is no more than 4 px larger in each dimension.
   - It stops at `body` and after `maxDepth` levels, and returns the highest such wrapper (or the element itself).
   - When there is no layout, every box is zero, so it never climbs: a page that isn't laid out gets the old placement.
2. **`linkedin.findApplyControl`:** returns `outermostSameBoxWrapper(found)`, for every way of finding the control. The button then goes after the wrapper, in the row with Apply and Save, and takes the wrapper's height (the same as the control's).
3. **Tests:**
   - The helper, in `dom.test.ts`: stub `getBoundingClientRect` per element. Cover a same-size wrapper chain (it climbs), a wider row (it stops), zero boxes (no climb), `maxDepth`, and `body`.
   - The adapter, on the 2026 fixture or a new `linkedin-signed-in-external-apply.html`, built from the facts above:
     - an `<a aria-label="Apply on company website">Apply</a>` inside a same-size wrapper with `overflow: hidden`;
     - a Save button beside it;
     - the tab title above.
4. **The Playwright check, real layout in Chromium:**
   - Serve that fixture at `https://www.linkedin.com/jobs/search-results/?currentJobId=4431674043` through `context.route`.
   - Check that the host is the wrapper's next sibling, not the `<a>`'s.
   - Check that it is really visible: `document.elementFromPoint` at the centre of the host's box returns the host.
   - Check the href.
   - Do the same on the 2026 Easy Apply fixture, and take screenshots.

**Checks:** `npm test`, `npm run lint`, `npx tsc --noEmit`, `CALLBACK_ORIGIN=http://localhost:3000 npm run extension:build`, and the Playwright check above. The owner checks the real page.
