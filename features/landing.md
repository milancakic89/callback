# Feature: Landing Page

**Status:** Implemented. `npm run build`, `npx tsc --noEmit` and `npm run lint` pass; `/` builds as static (1h revalidate) and `/jobs` as partial prerender. The page was checked in Chromium (Playwright) at 1440, 768, 390 and 320px wide, with and without reduced motion: no horizontal overflow, no console errors, demo controls and keyboard shortcuts work. Not yet checked in Safari or Firefox.

`/` is a dark marketing page for Callback. The public job list moved from `/` to `/jobs`. Signed-in visitors never see either: proxy sends them to `/dashboard`.

## Decisions
- **Routes**
  - `/`: landing (`src/app/page.tsx`).
  - `/jobs`: the public job list, moved unchanged from the old `src/app/page.tsx`; its logo now links to `/`.
  - Signed in, `/` and `/jobs` redirect to `/dashboard` (`SIGNED_IN_REDIRECT_PATHS` in `src/proxy.ts`).
  - `/?q=…`, `/?f=…` and `/?sort=…` (links shared before the move) redirect to `/jobs` with the query intact (`redirects()` in `next.config.ts`, 307).
  - `signOut` still lands on `/`, now the landing page.
- **Two audiences, honestly labelled.** The candidate side exists and is tagged "Available now". The employer side (Smart Screening, Fast Manual Mode, automated candidate updates) is not built and is tagged "Coming soon" everywhere it appears. The demos say they use fictional candidates. To launch the employer tools, change the `AvailabilityTag` statuses and the employer copy in `for-employers.tsx` and `final-cta.tsx`.
- **No invented numbers.** The only figures are the live job count and the newest postings, from the cached `getActiveJobs()`. No testimonials, customer logos or usage stats. Numbers inside the sample CVs belong to fictional people.
- **No employer sign-up yet.** Employer CTAs point at the review demo (`#product`) and the employer section, not at `/sign-up`, because an account can't do anything for an employer today. The Free plan's CTA follows the same rule. A waitlist would need a table and an action; out of scope.
- **Design system, scoped.** Near-black surfaces, off-white text, electric lime accent (`--l-lime: #c6f24e`), Geist / Geist Mono. All tokens are `--l-*` variables on `[data-landing]` in `src/components/landing/landing.css`, so the signed-in app's tokens are untouched. The CSS only loads on `/`.
- **Logo on dark.** `public/logo-cropped.png` has an opaque white background. `public/logo-on-dark.png` is the same image with the white keyed out and the wordmark recoloured off-white (same letterforms, same icon colours). `<Logo onDark />` picks it.
- **Motion is CSS only**, no animation library:
  - Hero: staggered rise-in, the product shot tilts into place, the stage chip flips Screening → Interview, then the candidate's update card arrives.
  - Scroll reveals: `ScrollReveal` (one IntersectionObserver for the page) sets `data-revealed`; the CSS hides nothing unless scripting is on and motion is allowed.
  - The candidate-updates timeline draws its lime line and lights the steps in turn.
  - Demo: documents slide in the direction of travel on Previous / Next.
  - Under `prefers-reduced-motion: reduce` everything renders in its final state.
- **CSP-safe.** No external images, fonts or scripts. The sample documents use system faces (`.l-doc-sans`, `.l-doc-serif`).
- **Only derived data reaches the page.** The page reads the full job list on the server but passes only the formatted count and six postings (newest first, one per company, locations de-duplicated) to the markup.

## Page structure

| # | Section | Component | Notes |
|---|---|---|---|
| — | Nav | `src/components/site-nav.tsx` (client, shared with `/jobs`) | Sticky, opaque dark bar. Product / For candidates / For employers / Pricing anchors, Jobs, Log in, Get started. Below `lg` a menu button (Escape closes); with six links the bar no longer fits a tablet. See [visual-continuity.md](./visual-continuity.md). |
| 1 | Hero | `hero.tsx`, `hero-visual.tsx` | "Every application deserves a response." Live job count pill → `/jobs`. CTAs: Find a job → `/jobs`, For employers → `#employers`. Product shot: review workspace (CV left, letter right) plus the candidate's "invited to interview" update. |
| 2 | Problem | `problem.tsx` | One editorial paragraph, then a Today → With Callback table. |
| 3 | For candidates `#candidates` | `for-candidates.tsx` | Live. Real newest postings in a job-board card (the heart and "Applied · Pending" on two rows are illustrative). |
| 4 | For employers `#employers` | `for-employers.tsx` | Coming soon. Three numbered pillars linking to the sections below. |
| 5 | Fast Manual Mode `#product` | `fast-manual.tsx`, `review-demo.tsx` (client) | The signature demo, see below. |
| 6 | Screening workflows `#screening` | `screening.tsx` | Smart Screening (requirements, sorted applicants, "Meets all / Review / Missing required") next to Fast Manual Mode, then the four-step flow that joins them. No accuracy or fairness claims; "your team still makes every decision". |
| 7 | Candidate updates `#updates` | `candidate-updates.tsx` | "Silence shouldn't be part of the hiring process." Submitted → In the pipeline → Status updated → Candidate informed. States that updates come from templates and personal feedback is still written by people. |
| 8 | Pricing `#pricing` | `pricing.tsx`, `pricing-table.tsx` (client), `pricing-card.tsx`, `pricing-plans.ts` | Coming soon. A single Free plan, see below. |
| 9 | Final CTA | `final-cta.tsx` | "Better hiring starts with a better response." Separate candidate and employer cards. |
| — | Footer | `site-footer.tsx` | Product / Candidates / Account links. No year (would be baked into the static page). |

Shared pieces live in `ui.tsx` (`Container`, `Eyebrow`, `SectionHeading`, `AvailabilityTag`, `ctaClass`, `Kbd`, `Initials`).

### Pricing (`pricing*.ts(x)`)
- **Only a Free plan for now.** Pricing isn't being built, so the section shows one card: Free, $0, "No payment needed", with three features (basic candidate management, manual candidate review, CV and cover letter preview). The heading is "Start free." and the note under the card says the plan opens when the employer tools launch and nothing is charged today. Starter and Pro were taken out; their text is kept under "Plans taken out" below.
- **One source of truth.** `PRICING_PLANS` in `pricing-plans.ts` holds every plan's name, tagline, monthly price (in cents), features and CTA. The helpers beside it (`periodCents`, `formatUsd`, `YEARLY_DISCOUNT = 0.2`: twelve months at 20% off, billed upfront) price a paid plan and stay in place, unused until one comes back.
- **The layout follows the plans** (`PricingTable`, the only client part):
  - **One plan:** a single centred card (`max-w-md`), stacked at every width and without the alignment min-heights. The Monthly / Yearly switch is hidden, because a free plan has no period to choose, and a free plan shows no "/month".
  - **A plan with a price** brings the switch back: a two-button group with `aria-pressed` and a polite live line saying how the selected period is billed. Yearly cards show the yearly total, "/year" and "Billed upfront, once a year · $15.20/month". Nothing is stored or sent.
  - **More than one plan:** phones get one card per row. Tablets (`md` to `lg`) get one card per row, price and CTA on the left and features on the right. Desktop gets three columns, with min-heights on the tagline and billing note so prices and CTAs line up across cards.
  - A plan marked `recommended` gets a lime-tinted border, a lime hairline along the top, a "Recommended" tag, lime checkmarks and the only lime CTA; the others use the secondary button.
- **The CTA follows the employer placeholder rule.** The plan is for the employer tools, which don't exist yet, so its CTA points at `#employers` (the "Coming soon" section), like the page's other employer CTAs. To make it real, change `cta.href` in `PRICING_PLANS`.
- **Plans taken out** (to bring one back, add it to `PRICING_PLANS` again):
  - **Free's removed line:** "1 active job".
  - **Starter**, $19/month ($182.40/year), "For small teams hiring occasionally.", CTA "Choose Starter". Up to 3 active jobs; unlimited manual candidate review; side-by-side original CV and cover letter; Previous / Next candidate navigation; candidate status management.
  - **Pro**, $49/month ($470.40/year), recommended, "For teams that want a faster screening process.", CTA "Choose Pro". Up to 10 active jobs; everything in Starter; AI-assisted candidate screening; candidate ranking and filtering; Fast Manual Review mode; higher AI screening limits.
  - **Two lines needed a product decision before launch:** Starter already listed side-by-side documents with Previous / Next (which is what Fast Manual Mode is), while Pro added "Fast Manual Review mode"; and Pro's "Higher AI screening limits" compared to a plan below it that had no AI screening.

### Fast Manual Mode demo (`review-demo.tsx`)
- Three fictional candidates (`sample-documents.tsx`), each with a differently designed CV and cover letter: classic sans, two-column with a tinted sidebar, centred serif. That is the point of the mode: the original files, not normalised profile cards.
- Toolbar: role, candidate name and location, `n / 3` counter, Previous and Next. A thin lime bar under it shows progress. Next wraps from the last candidate to the first.
- Each pane has its own scroll position (reset to the top on a new candidate) and its own zoom (85–130%). Zoom scales the page's `em`-based type through `--z`.
- Keyboard: ← / → anywhere inside the demo. An `aria-live` line announces "Candidate 2 of 3: Jonas Weber".
- Below `md` one document is shown at a time, with a CV / Cover letter switch; Previous / Next become icon buttons.

## Files
- `src/app/page.tsx` (new landing), `src/app/jobs/page.tsx` (moved job list)
- `src/components/landing/*` (new), `src/components/site-nav.tsx` and `src/components/dark-surface.tsx` (shared with `/jobs` and the auth pages), `src/components/brand.tsx` (`onDark`)
- `public/logo-on-dark.png` (new)
- `src/proxy.ts`, `next.config.ts`
- Comment updates: `src/app/(auth)/actions.ts`, `src/lib/jobs/filter.ts`
- Docs: `project-overview/architecture.md`, `security.md`, `roadmap.md`, `features/dashboard.md`

## Verification
- Build output lists `/` as static and `/jobs` as partial prerender.
- `/` signed out shows the landing page; `/jobs` shows the table; signed in, both go to `/dashboard`.
- `/?f=abc&sort=title` returns 307 to `/jobs?f=abc&sort=title`.
- At 320 / 390 / 768 / 1440px `document.documentElement.scrollWidth` equals the viewport width.
- With reduced motion, the hero shows "Interview" and the update card immediately, and every section is visible without scrolling into it.
- Demo: Next, Previous, ← / →, zoom in / out per pane, and the mobile CV / Cover letter switch.

## Out of scope / next
- The employer product itself, and an employer waitlist.
- An Open Graph image (`opengraph-image.tsx`).
- Paid plans, checkout, subscriptions or plan limits behind the pricing section; a Serbian version; analytics.
