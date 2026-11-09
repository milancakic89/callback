# Feature: Landing Page

**Status:** Implemented. `npm run build`, `npx tsc --noEmit` and `npm run lint` pass; `/` builds as static (1h revalidate) and `/jobs` as partial prerender. The page was checked in Chromium (Playwright) at 1440, 768, 390 and 320px wide, with and without reduced motion: no horizontal overflow, no console errors, demo controls and keyboard shortcuts work. Not yet checked in Safari or Firefox.

`/` is a dark marketing page for Callback. The public job list moved from `/` to `/jobs`. Signed-in visitors never see either: proxy sends them to `/dashboard`.

**Updated 2026-11-09, to match the app** (text and tags only, no new sections): the employer side is no longer all "Coming soon". An employer can open an account, set up a company, post and publish jobs, receive applications (a candidate applies with a CV and a cover letter, [apply-with-cv.md](./apply-with-cv.md)) and review them in Fast Manual Mode with hiring statuses ([applicant-review.md](./applicant-review.md), [application-status.md](./application-status.md)). Smart Screening is live too, as a free keyword check of the CV's text against a job's requirements ([cv-screening.md](./cv-screening.md); until its migration is applied the screen still says "Not checked yet"). Still not built, and still "Coming soon": the message to a candidate when the status changes. `npm test`, `npm run lint` and `npx tsc --noEmit` pass, and the page was checked in Chromium at 1440, 768, 390 and 320px (no horizontal overflow, tags in the intended order, every employer CTA to `/sign-up`). **Not checked:** the "Auto-tracked" row of the job preview in a browser (a render test covers it), and `npm run build` with the new job-board read (see [apply-with-cv.md](./apply-with-cv.md): the page prerenders `getActiveJobs()`, which needs the published-jobs migration).

**Updated 2026-11-09, real screenshots** ([landing-screenshots.md](./landing-screenshots.md)): the hand-built look-alikes of Fast Manual Mode are gone. The hero and the Fast Manual Mode section now show screenshots of the real review screen (the playlist, the CV, the cover letter, the screening overview, the statuses and the heart), taken by `npm run landing:screenshots` into `public/landing/*.webp`. `review-demo.tsx` (the interactive demo) was deleted, and with it the demo's arrow keys, zoom and the "Illustrative demo" caption. `npm test`, `npm run lint` and `npx tsc --noEmit` pass, and the page was checked in Chromium at 1440, 1024, 768, 390 and 320px (no horizontal overflow, no console errors, the tabs work by click and by Left / Right).

## Decisions
- **Routes**
  - `/`: landing (`src/app/page.tsx`).
  - `/jobs`: the public job list, moved unchanged from the old `src/app/page.tsx`; its logo now links to `/`.
  - Signed in, `/` and `/jobs` redirect to `/dashboard` (`SIGNED_IN_REDIRECT_PATHS` in `src/proxy.ts`).
  - `/?q=…`, `/?f=…` and `/?sort=…` (links shared before the move) redirect to `/jobs` with the query intact (`redirects()` in `next.config.ts`, 307).
  - `signOut` still lands on `/`, now the landing page.
- **Two audiences, honestly labelled, three states.** `AvailabilityTag` (`ui.tsx`) says "Available now" (`live`), "Partly available" (`partial`, a section that mixes both, whose text then says which part) or "Coming soon" (`soon`). The candidate side is live. On the employer side, publishing, Smart Screening (a keyword check) and manual review are live, the candidate message is `soon`, and the sections that hold both (For employers, Candidate updates) are `partial`, with a tag on each pillar or panel. The Fast Manual Mode screenshots say their candidates are fictional. When the candidate message ships, change that tag and the sentence beside it. **Copy rule:** don't say a candidate is told how an application went; the app's own "Auto-tracked" tooltip ("your application status updates automatically") is ahead of the product, and the landing page must not repeat it. Smart Screening is described as what it is: it reads words, not meaning, and leaves things like years of experience to the reviewer.
- **No invented numbers.** The only figures are the live job count and the six postings of the job preview (jobs posted on Callback first, then the newest, one per company, `newestPerCompany` in `newest-jobs.ts`), from the cached `getActiveJobs()`. No testimonials, customer logos or usage stats. Numbers inside the sample CVs belong to fictional people.
- **Employer CTAs go to `/sign-up`** (hero "Start hiring", the employer section, the Free plan's "Get started free", the final card, the footer), where the account-type dialog offers "I'm hiring". They used to point at `#product` and `#employers` because an account could do nothing for an employer; "See Fast Manual Mode" and "See the review workflow" still lead to the screenshots. A waitlist is no longer needed.
- **Design system, scoped.** Near-black surfaces, off-white text, electric lime accent (`--l-lime: #c6f24e`), Geist / Geist Mono. All tokens are `--l-*` variables on `[data-landing]` in `src/components/landing/landing.css`, so the signed-in app's tokens are untouched. The CSS only loads on `/`.
- **Logo on dark.** `public/logo-cropped.png` has an opaque white background. `public/logo-on-dark.png` is the same image with the white keyed out and the wordmark recoloured off-white (same letterforms, same icon colours). `<Logo onDark />` picks it.
- **Motion is CSS only**, no animation library:
  - Hero: staggered rise-in, the product shot tilts into place, then the candidate's update card arrives.
  - Scroll reveals: `ScrollReveal` (one IntersectionObserver for the page) sets `data-revealed`; the CSS hides nothing unless scripting is on and motion is allowed.
  - The candidate-updates timeline draws its lime line and lights the steps in turn.
  - Screenshots: the chosen one fades in when its tab is picked.
  - Under `prefers-reduced-motion: reduce` everything renders in its final state.
- **CSP-safe.** No external images, fonts or scripts. The sample documents use system faces (`.l-doc-sans`, `.l-doc-serif`).
- **Only derived data reaches the page.** The page reads the full job list on the server but passes only the formatted count and six postings (newest first, one per company, locations de-duplicated) to the markup.

## Page structure

| # | Section | Component | Notes |
|---|---|---|---|
| — | Nav | `src/components/site-nav.tsx` (client, shared with `/jobs`) | Sticky, opaque dark bar. Product / For candidates / For employers / Pricing anchors, Jobs, Log in, Get started. Below `lg` a menu button (Escape closes); with six links the bar no longer fits a tablet. See [visual-continuity.md](./visual-continuity.md). |
| 1 | Hero | `hero.tsx`, `hero-visual.tsx`, `product-shot.tsx` | "Every application deserves a response." Live job count pill → `/jobs`. CTAs: Find a job → `/jobs`, Start hiring → `/sign-up`. Product shot: the first screenshot of the real review screen, plus the candidate's "invited to interview" update (decorative, `alt=""`: the same screenshot is described in section 5). |
| 2 | Problem | `problem.tsx` | One editorial paragraph, then a Today → With Callback table. |
| 3 | For candidates `#candidates` | `for-candidates.tsx` | Live. Four features (search, save, apply with your CV, track). Real postings in a job-board card: a job posted on Callback is shown first with the lime "Auto-tracked" pill and no heart, as on the board (the heart and "Applied · Pending" on two other rows are illustrative). |
| 4 | For employers `#employers` | `for-employers.tsx` | Partly available. "Start hiring" and "See Fast Manual Mode" buttons, and three numbered pillars, each with its own tag: Publish and manage roles (live), Screen your way (live), Keep candidates informed (coming soon). |
| 5 | Fast Manual Mode `#product` | `fast-manual.tsx`, `review-screenshots.tsx` (client), `product-shot.tsx` | Available now. Screenshots of the real review screen, three of them behind tabs, see below. The caption says they are the real screen with fictional candidates, and that a new employer account starts with a sample job like it. |
| 6 | Screening workflows `#screening` | `screening.tsx` | Available now. Smart Screening (a keyword check of the CV against the job's requirements; the sorted table is illustrative and its scores are made up) next to Fast Manual Mode, then the four-step flow that joins them, whose last step, "The candidate is updated", says "(coming soon)". No accuracy or fairness claims; "your team still makes every decision". |
| 7 | Candidate updates `#updates` | `candidate-updates.tsx` | Partly available. "Silence shouldn't be part of the hiring process." Submitted → In the pipeline → Status updated → Candidate informed: the first three work today, the message in the last step does not. The note says what a candidate sees today (a confirmation on the posting page) and that updates will use templates the team controls. |
| 8 | Pricing `#pricing` | `pricing.tsx`, `pricing-table.tsx` (client), `pricing-card.tsx`, `pricing-plans.ts` | Available now. A single Free plan, see below. |
| 9 | Final CTA | `final-cta.tsx` | "Better hiring starts with a better response." Separate candidate and employer cards; the employer one has "Start hiring" → `/sign-up` and "See the review workflow". |
| — | Footer | `site-footer.tsx` | Product / Candidates / Employers / Account links. No year (would be baked into the static page). |

Shared pieces live in `ui.tsx` (`Container`, `Eyebrow`, `SectionHeading`, `AvailabilityTag`, `ctaClass`, `Kbd`, `Initials`).

### Pricing (`pricing*.ts(x)`)
- **Only a Free plan for now.** Pricing isn't being built, so the section shows one card: Free, $0, "No payment needed", tagline "For employers trying Callback.", with four features (post jobs and publish them to the job board, review every applicant in Fast Manual Mode, original CV and cover letter side by side, a hiring status for each candidate). The heading is "Start free.", it is tagged "Available now", and the note under the card says nothing is charged on Callback today. Starter and Pro were taken out; their text is kept under "Plans taken out" below.
- **One source of truth.** `PRICING_PLANS` in `pricing-plans.ts` holds every plan's name, tagline, monthly price (in cents), features and CTA. The helpers beside it (`periodCents`, `formatUsd`, `YEARLY_DISCOUNT = 0.2`: twelve months at 20% off, billed upfront) price a paid plan and stay in place, unused until one comes back.
- **The layout follows the plans** (`PricingTable`, the only client part):
  - **One plan:** a single centred card (`max-w-md`), stacked at every width and without the alignment min-heights. The Monthly / Yearly switch is hidden, because a free plan has no period to choose, and a free plan shows no "/month".
  - **A plan with a price** brings the switch back: a two-button group with `aria-pressed` and a polite live line saying how the selected period is billed. Yearly cards show the yearly total, "/year" and "Billed upfront, once a year · $15.20/month". Nothing is stored or sent.
  - **More than one plan:** phones get one card per row. Tablets (`md` to `lg`) get one card per row, price and CTA on the left and features on the right. Desktop gets three columns, with min-heights on the tagline and billing note so prices and CTAs line up across cards.
  - A plan marked `recommended` gets a lime-tinted border, a lime hairline along the top, a "Recommended" tag, lime checkmarks and the only lime CTA; the others use the secondary button.
- **The CTA opens sign-up.** "Get started free" goes to `/sign-up` (`cta.href` in `PRICING_PLANS`, pinned by `pricing-plans.test.ts`), like the page's other employer CTAs. `PricingCard` uses `next/link` for it.
- **Plans taken out** (to bring one back, add it to `PRICING_PLANS` again):
  - **Free's removed line:** "1 active job".
  - **Starter**, $19/month ($182.40/year), "For small teams hiring occasionally.", CTA "Choose Starter". Up to 3 active jobs; unlimited manual candidate review; side-by-side original CV and cover letter; Previous / Next candidate navigation; candidate status management.
  - **Pro**, $49/month ($470.40/year), recommended, "For teams that want a faster screening process.", CTA "Choose Pro". Up to 10 active jobs; everything in Starter; AI-assisted candidate screening; candidate ranking and filtering; Fast Manual Review mode; higher AI screening limits.
  - **Two lines needed a product decision before launch:** Starter already listed side-by-side documents with Previous / Next (which is what Fast Manual Mode is), while Pro added "Fast Manual Review mode"; and Pro's "Higher AI screening limits" compared to a plan below it that had no AI screening.

### Fast Manual Mode screenshots (`review-shots.ts`, `product-shot.tsx`, `review-screenshots.tsx`)
- **Real screen, not a look-alike.** Taken from the review of the sample job (three fictional candidates, [demo-job.md](./demo-job.md)) by `scripts/capture-landing-screenshots.ts` (`npm run landing:screenshots`, Playwright Chromium against a running app, signed in as an employer from `LANDING_SCREENSHOT_EMAIL` / `LANDING_SCREENSHOT_PASSWORD`). Re-run it whenever the review screen changes; the files are committed.
- **Three screens**, each in two sizes (`REVIEW_SHOTS`):
  - *Side by side*: Ana Novak, with the playlist (a status on two of the three, a heart, "2 / 3 viewed"), the CV, the small cover letter and the overview;
  - *Cover letter*: Jonas Weber with the letter opened at reading size (the hover behaviour);
  - *Status*: the playlist's status filter open, with the count per status.
  Laptop: 1440 × 900 at 2x (the four columns). Phone: 390 × 844 at 2x (the one-view-at-a-time layout: the CV, the cover letter, the overview).
- **Files:** `public/landing/{review,letter,status}-{desktop,mobile}.webp` (webp, quality 86, 40 to 170 KB each). `src/proxy.ts` leaves `webp` out of its matcher; an `.avif` would go through the proxy. `next/image` serves them resized.
- **Sizes agree by construction:** the script reads the viewport sizes and the file names from `review-shots.ts`, and the page reads the same list. `review-shots.test.ts` opens every file and compares its format and size with its entry.
- **`ProductShot`** shows the laptop's screenshot from `lg` and the phone's below it (narrow, centred), so four columns are never shrunk to a phone's width; only the one that shows is downloaded.
- **`ReviewScreenshots`** (the only client part): a tablist over the three shots, with Left / Right moving and selecting. All three sit in one grid cell and the chosen one fades in (no fade under reduced motion); the others are `inert`. The caption under them is a polite live region.
- **Not interactive.** The old demo's zoom, scroll and Previous / Next are gone: a screenshot can't do them. The real screen is one sign-up away ("Start hiring").

## Files
- `src/app/page.tsx` (new landing), `src/app/jobs/page.tsx` (moved job list)
- `src/components/landing/*` (new; `review-demo.tsx` was replaced by `review-shots.ts`, `product-shot.tsx` and `review-screenshots.tsx`, [landing-screenshots.md](./landing-screenshots.md)), `src/components/site-nav.tsx` and `src/components/dark-surface.tsx` (shared with `/jobs` and the auth pages), `src/components/brand.tsx` (`onDark`)
- `public/logo-on-dark.png` (new), `public/landing/*.webp` (the screenshots)
- `src/proxy.ts`, `next.config.ts`
- Comment updates: `src/app/(auth)/actions.ts`, `src/lib/jobs/filter.ts`
- Docs: `project-overview/architecture.md`, `security.md`, `roadmap.md`, `features/dashboard.md`

## Verification
- Build output lists `/` as static and `/jobs` as partial prerender.
- `/` signed out shows the landing page; `/jobs` shows the table; signed in, both go to `/dashboard`.
- `/?f=abc&sort=title` returns 307 to `/jobs?f=abc&sort=title`.
- At 320 / 390 / 768 / 1440px `document.documentElement.scrollWidth` equals the viewport width.
- With reduced motion, the hero shows "Interview" and the update card immediately, and every section is visible without scrolling into it.
- Screenshots: each tab by click and by ← / →, one panel not `inert` at a time, and the phone's screenshot below 1024px.

## Out of scope / next
- The employer product itself, and an employer waitlist.
- An Open Graph image (`opengraph-image.tsx`).
- Paid plans, checkout, subscriptions or plan limits behind the pricing section; a Serbian version; analytics.
