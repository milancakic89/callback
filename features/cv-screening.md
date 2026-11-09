# Feature: Free CV Screening (a keyword ATS)

**Status:** Implemented in code, and **the migration `supabase/migrations/20261109140000_cv_screening.sql` is applied** (2026-11-09, through `apply_migration`) and checked with SQL (see [Verification](#verification)). `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. The riskiest part, pdf.js reading a PDF **inside the standalone production build** (it needs its worker file, which a bundled server doesn't have on disk), was checked: a standalone server read the demo CV through a throwaway route (later deleted) and answered `checked` for a CV and `unreadable` for a page with no text. Eight deliberate breakages of the new code (matcher, engine, apply, re-check, order, summary) each turned the suite red. Since [candidate-cvs.md](./candidate-cvs.md), `applyToJob` reads the CV it screens from R2 (it is on the candidate's account), and only when the job has filters. **Not checked yet:** the browser run.


## What it does
An employer sets **required** and **nice-to-have** filters on a job ([job-filters.md](./job-filters.md)): short free text such as "React", "Design systems", "English C1", "5+ years". Until now nothing read a CV against them, and the review screen said "Not checked yet". Now:

- **When a candidate applies,** their CV is read as text and checked for each filter's words. The result is stored with the application.
- **When the employer changes a job's filters,** or moves applicants to the job, every active application of the job is checked again, after the response.
- **On the review screen** ([applicant-review.md](./applicant-review.md)) the overview shows each filter as met (✓), missing (✗) or **"?" check by eye**, the playlist shows `met/total` for the required filters, and the playlist can be ordered **Best match** first.

It costs nothing: no paid API, no model, no account. The text is read with `pdfjs-dist` (already installed: the review screen draws the same files with it), and the matcher is plain TypeScript with **no new dependency**.

## Decisions (agreed with the user, 2026-11-09)
- **Words and phrases plus synonyms.** Whole words or phrases, ignoring case and accents, so `java` is not `javascript` and `Cacak` finds `Čačak`; plus a small built-in list of synonyms and light word forms. It matches **words, never meaning**, and the screen says so.
- **A filter a keyword can't decide is not "missing".** A quantity ("5+ years", "3 godine iskustva") is shown as **"?" check by eye** and counts as neither met nor missing.
- **Swappable.** Everything goes through one small interface (`ScreeningEngine`, see below), so a real ATS or a model behind an API replaces the keyword engine by changing one line, with no dependency in the app.
- **Checked when:** the candidate applies, and again when the filters change. The cover letter is not checked.
- **Sorting:** the playlist can be ordered by match. Nobody is hidden or rejected.
- **A scan has no text.** No OCR (it is slow, heavy on a small server and adds tens of MB of language data). A CV with no readable text is marked **"Couldn't read the text of this CV (it may be a scan)"**, and the reviewer reads it.
- **Kept from the earlier decisions:** nothing is rejected automatically; the filters and the results are private to the company and never reach a candidate; no accuracy or fairness claims.

## How it works

### The interface: `src/lib/screening/engine.ts`
```ts
interface ScreeningEngine {
  readonly id: string;                                  // stored with each result, e.g. "keywords-v1"
  screen(cv: { bytes: Uint8Array; fileName: string },
         filters: { required: readonly string[]; optional: readonly string[] }): Promise<ScreeningOutcome>;
}
type ScreeningOutcome =
  | { kind: "checked"; verdicts: Record<string, "met" | "missing" | "unverified"> }  // keyed by the job's own labels
  | { kind: "unreadable" };
```
`toScreeningColumns()` turns an outcome into the columns of `job_applications`. `src/lib/screening/index.ts` has **the one line that picks the engine**, `export const screeningEngine: ScreeningEngine = keywordEngine;`, and `screenCv()`, which never throws (a failure is logged and gives no result, so a problem with the screening can't stop an application).

**To use a real ATS:** write an object with the same shape that calls it (the CV's bytes in, a verdict for each label out), give it a new `id`, and change that line. Nothing else knows which engine it is. Results made by the old engine keep their `screening_engine`, so they can be told apart and redone with `rescreenJob()`.

### Reading the PDF: `src/lib/screening/pdf-text.ts`
`extractPdfText(bytes, { maxPages: 10, timeoutMs: 5000 })` with the **legacy** build of pdf.js (the one that runs in Node). The text layer only: a scan gives an empty string. It hands pdf.js its worker as `globalThis.pdfjsWorker` through a static import, so the bundler includes the worker file (the default is a dynamic `import("./pdf.worker.mjs")`, which the standalone output doesn't contain). Throws on a damaged file and on timeout; the engine turns both into `unreadable`. The bytes are copied first, because pdf.js takes over the memory of the array it is given.

### The keyword engine: `keyword-engine.ts`, `match.ts`, `canon.ts`, `synonyms.ts`
- **Unreadable** when the text has fewer than 40 letters, or can't be read at all.
- **`canonText()`:** lower case, no accents, no hyphens, every mark except `+ # .` a space, so "English (C1)" reads `english c1`, "UI/UX" reads `ui ux`, and `c++`, `c#`, `.net`, `node.js` survive.
- **`prepareCvText()`:** puts back a heading set in wide letter-spacing (`P R O F I L E`, capitals only, four or more) and a word hyphenated across a line break, then `canonText()`.
- **`matchFilter(label, text)`:**
  1. a quantity (`5+ years`, `3 godine`, `2 yrs`, `6 months`) → **unverified**;
  2. a label with no letter or digit → unverified;
  3. otherwise the label's own words and the other members of its **synonym group** (`React`/`React.js`/`ReactJS`, `JS`/`JavaScript`, `Postgres`/`PostgreSQL`, `K8s`/`Kubernetes`, `Engleski`/`English`, `WCAG`/`Accessibility`, …) are looked for as whole words or phrases → **met** or **missing**.
- **Word forms:** a word of six letters or more keeps its stem and allows common endings (`mentor` finds `mentored` and `mentoring`; `design system` finds `design systems`). Shorter words, which are most tech names, match only as they are: `React` is not found in `reacted`. A name is not found in a longer one that ends in a symbol (`C` is not `C++`).
- **Synonyms are conservative on purpose:** a word that is also an ordinary one (`go`, `rest`, `swift`, `node`) stays out. A false "met" is worse than a "missing" the reviewer can correct. To add a group, edit `synonyms.ts` and add a case to `match.test.ts`.

### What the demo CVs say (the engine's real answers)
The demo job's hand-written matches were made by reading the CVs; words alone differ in two places, both as expected:
- **"5+ years experience"** is a quantity, so **unverified** for all three (the hand-written ones say met).
- **"Design systems"** is missing from Jonas's and Priya's CVs by words (they describe a component library and a shared kit), where the hand-written ones say met. Ana's has the words. `keyword-engine.test.ts` pins all three verdict sets. The demo job itself still shows its hand-written matches: they are stored, not computed.

### Database: `supabase/migrations/20261109140000_cv_screening.sql`
- `job_applications` gains `unverified_filters text[]`, `screening_outcome text` (`checked` / `unreadable`), `screened_at timestamptz`, `screening_engine text`. `matched_filters` (applicant_review) keeps its meaning. **None is in any grant**: only the secret key writes them; the company reads them through the table's own select policy.
- A row with `matched_filters` and no `screening_outcome` is read as **checked** (the demo job's).
- `save_screening(...)` (`security definer`, `search_path = ''`, executable by `service_role` only) writes one result **only if the job still has the filters it was made for**, compared as sets (order doesn't matter, as in `sameFilters()`). A re-check reads the filters, then reads and checks each CV, which takes a while; an employer who edits again in the meantime starts another re-check, and the older one must not overwrite it with answers to filters that are gone.

### When it runs
- **Apply** (`applyToJob`, [apply-with-cv.md](./apply-with-cv.md)): after the files are stored and before the insert, the job's filters are read with the secret key (they never go into the action's result), the CV bytes already in memory are screened, and the columns go in the same insert. **Never a reason to refuse an application:** no filters, a failure, or an unreadable filter read leaves the columns null ("Not checked yet").
- **Filters changed** (`updateJobPosting`): the job's filters are read before the update; if the set differs (a filter added, removed, spelled differently or moved between the lists; reordering is not a change), `after(() => rescreenJob(jobId))` runs once the response is sent (`after()` works in Server Actions, and the app is a long-running Node server).
- **Applicants moved** (`unpublishJobPosting` with `move`): `after(() => rescreenJob(targetJobId))`, since moved applications carry results made for another job's filters.
- **`rescreenJob()`** (`src/lib/screening/rescreen.ts`): clears the results of the job's active applications (so the reviewer sees "Not checked yet", never answers to filters that are gone), then reads each CV from R2 and checks it, **one at a time**, saving through `save_screening`. A failure on one application is logged and skipped. The demo job is never touched. Safe to run twice at once, because of the guard in `save_screening`.

### The review screen
- `getJobApplicants` also selects `unverified_filters` and `screening_outcome`.
- `summarizeFilters(required, optional, { matched, unverified, outcome })` (`src/lib/review/matches.ts`) gives a **status** (`unchecked`, `unreadable`, `checked`) and a state for each filter (`met`, `missing`, `unverified`). Until a CV is checked every filter is left to the reviewer, and none counts as met. A filter added after a check shows as missing.
- `ScreeningOverview` (`ats-panel.tsx`): ✓ / ✗ (grey, not red) / `?`, "N to check by eye", the not-checked and "couldn't read" notes, the badge **Keyword check**, and the line "Matched by the words in the CV, not by what it means."
- **Order** (`src/lib/review/order.ts`, `orderApplicants`): **Applied** (as they came in) or **Best match**: checked CVs first, most required filters met, then most nice-to-have, then the order they came in; not checked and unreadable last. Shown only for a job that has filters. The list, Next and ← all walk the same ordered list, so they can't disagree; changing the order keeps the open applicant open.
- The playlist shows `met/total` with a `?` when some required filters are left to the reviewer.

## Limits to know
- **Words, not meaning.** "Led a team of designers" does not meet a filter "Management"; "Figma" in a skills list and "Figma" in a passing mention look the same. A CV that spells a skill another way than any synonym will show it as missing. The reviewer reads the CV; this only saves the first look.
- **Scans, images and fancy layouts.** No OCR. A CV whose text layer is in a strange order may read oddly; letter-spaced capitals and hyphenated line breaks are handled, columns are read as the PDF orders them.
- **Years, degrees and levels** ("5+ years", a bachelor's degree) are never decided. Years are marked "?"; the rest depends on the words.
- **Reading is bounded:** 5 MB a file (the upload limit), 10 pages, 5 seconds.
- **The text is not stored.** Only the verdicts are. A re-check reads the CV again from R2.
- **Re-checking a job with many applications** reads them one at a time after the response; until it finishes the reviewer sees "Not checked yet" on the rest. There is no queue: if the server restarts in the middle, the unfinished ones stay "Not checked yet" until the filters change again.
- **A switch of engine** doesn't redo old results by itself; `rescreenJob()` does it per job.

## Files
- **New:** `src/lib/screening/` (`engine.ts`, `index.ts`, `keyword-engine.ts`, `match.ts`, `canon.ts`, `synonyms.ts`, `pdf-text.ts`, `rescreen.ts`, `same-filters.ts`, and a test for each), `src/lib/review/order.ts` (+ test), `src/types/pdfjs-worker.d.ts`, `supabase/migrations/20261109140000_cv_screening.sql`.
- **Changed:** `src/lib/jobs/filter.ts` (exports `escapeRegExp` and `wordBounded`), `src/app/jobs/[jobId]/actions.ts`, `src/app/(employer)/[company]/actions.ts`, `src/lib/companies/workspace.ts`, `src/lib/review/matches.ts`, `src/components/review/ats-panel.tsx`, `candidate-playlist.tsx`, `applicant-review.tsx`, `src/components/employer/job-editor.tsx` (the note under the filters), the landing's `screening.tsx` and `for-employers.tsx`.

## Verification
**Done:** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`; the standalone server reading a PDF (above); deliberate breakages (above).

**Done with SQL** (2026-11-09), as a real employer in a `DO` block that ended with a deliberate exception, so nothing was kept: `anon` and `authenticated` can't call `save_screening` (`42501`), and an employer can't update `screening_outcome` or `unverified_filters` (`42501`); an employer sees the new columns on their own applications and none of another company's; `save_screening` writes with the job's filters (true), refuses filters the job doesn't have (false), writes with the same filters in another order (true), and a bad outcome is refused by the check (`23514`). The security advisors show nothing new: `save_screening` isn't executable by a client, so it isn't listed.

**Still to do:**
- **In a headless Chromium against `next dev`**, with a throwaway `@example.com` employer and candidate, deleted afterwards with their files in R2:
  1. the employer publishes a job with required filters (one a quantity) and nice-to-have ones;
  2. the candidate applies with a text PDF: the overview shows ✓ / ✗ / `?`, and the playlist `met/total`;
  3. a candidate applies with a scan or a text-less PDF: "Couldn't read the text of this CV";
  4. the employer edits the filters: the results go to "Not checked yet", then fill in again;
  5. **Best match** reorders the playlist, Next and ← follow it, and the open applicant stays open.
- The standalone check again with the real `applyToJob` path, once the migration is in.

## Out of scope
- OCR for scans (the free option, `tesseract.js`, was left out: slow, heavy on RAM, tens of MB of language data).
- Checking the cover letter, and reading years of experience from date ranges.
- Showing a candidate anything about the check, and rejecting or hiding anyone by it.
- A queue for re-checks, and a button to redo one.
