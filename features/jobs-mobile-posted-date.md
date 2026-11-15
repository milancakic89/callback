# Fix: the posted date on the job cards (phone width)

**Status:** done, 2026-11-15, on the branch `fix/jobs-mobile-posted-date` (not committed).
- **Done:** the Posted cell is the card's fourth line (`max-md:col-start-1 max-md:row-start-4 max-md:text-muted-foreground`, no `max-md:hidden`) and `PostedCell` lives in `src/components/jobs/posted-cell.tsx` with the `md:hidden` "Posted " word inside the same inline element as the date (so the card's flex gap doesn't separate them). `jobs-table.tsx` imports it (362 lines, was 377; still over 300, as before) and its card-grid comment now says four lines. `features/dashboard.md` "Responsive" says four lines. New tests: `posted-cell.test.ts` (8) and `jobs-table.test.ts` (7). No existing test changed. The no-clock branch of `PostedCell` uses the existing `jobDate()` instead of repeating `postedAt ?? firstSeenAt`.
- **Checks:** `npm test` 145 files, 1,365 tests pass (143 and 1,350 before); `npm run lint` and `npx tsc --noEmit` pass; `npm run build` passes, and `/jobs` is `○` static (revalidate 1h, expire 1d), as `features/performance.md` says it is (this plan's "partial prerender" was wrong: `/dashboard` is the `◐` one).
- **Chromium (Playwright), production build on port 3102, `/jobs` signed out:** at 390 px and at 320 px 20 cards and 20 "Posted …" lines ("Posted 11 hours ago"), each under its card's Company, in the first column, the same colour as Company, one space between the word and the date, `scrollWidth` equal to `innerWidth` (no horizontal overflow), no console errors. At 1440 px the Posted column shows "11 hours ago" and so on, none of the 20 cells shows the word (all 20 spans are `display: none`), and no console errors. Screenshots in the scratchpad: `jobs-390.png`, `jobs-320.png`, `jobs-1440.png`.
- **Not done:** the static fallback's "Posted 12 Nov 2026" and the tooltip's "First seen …" text are covered by the unit tests only, not looked at in a browser (the browser run has the clock, and the tooltip opens on hover).

## Why (the owner)
On `/jobs` at phone width you can't see when a job was posted. The date should show there too, in the same style as the other columns on the card.

## What is there today
Below `md` (768 px), every row of `JobsTable` (`src/components/jobs/jobs-table.tsx`) is a card, a two-column grid of three lines ([dashboard.md](./dashboard.md), "Responsive"):

| Line | Left | Right |
|---|---|---|
| 1 | Label | the eye |
| 2 | Work mode | the heart |
| 3 | Company | the Applied checkbox |

Location, Source and **Posted** are `max-md:hidden`. The same table is used on `/jobs`, `/saved-jobs` and in the static Suspense fallback (`jobs-explorer-fallback.tsx`), so the fix reaches all three.

## The change
- **A fourth line on the card, left column:**
  - **Placement:** the Posted cell loses `max-md:hidden` and takes `max-md:col-start-1 max-md:row-start-4`, under Company.
  - **Style:** the Company line's (`text-muted-foreground`), so on a card the date reads as one more muted detail. Each column on a card already has a line of its own, and this keeps to that.
  - **Right column of that line:** empty.
- **A word in front, on cards only.** On a card there is no column header to say what a bare "3 days ago" means, so it reads "Posted 3 days ago", "Posted yesterday", or "Posted 12 Nov 2026" where there is no clock (the static fallback). The word is `md:hidden`, so the desktop cell is unchanged.
- **The cell keeps its rules.** A job with no `postedAt` still shows the first-seen date, muted, with the "First seen …" tooltip. Without `now` (prerender) the date is still absolute, so no `Date.now()` during prerendering (AGENTS.md).
- **Desktop (`md` and up) does not change at all.**
- **`PostedCell` moves to its own file**, `src/components/jobs/posted-cell.tsx`, with a test. `jobs-table.tsx` is already over 300 lines, and this takes a part out of it rather than adding one.

## Tests
- `src/components/jobs/posted-cell.test.ts`, with `renderToStaticMarkup` like the other tests in that folder:
  - with `now` and a `postedAt`: the relative date;
  - with `now` and no `postedAt`: the first-seen date, muted, with its tooltip trigger;
  - without `now`: the absolute date.
  In each case the "Posted" word is there, `md:hidden`.
- `src/components/jobs/jobs-table.test.ts` (the table had no test of its own). A rendered row's Posted cell:
  - is not `max-md:hidden`;
  - sits at `max-md:row-start-4` in the first column;
  - carries the muted style;
  - the Location and Source cells are still hidden on cards.
- No existing test is changed.

## Docs
`features/dashboard.md`, "Responsive": the card is "four lines: Label and the eye, Work mode and the heart, Company and the Applied checkbox, and the posted date".

## Checks
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. `/jobs` stays as it is in the route table (partial prerender).
- In Chromium (the repo's Playwright), against a production build on a free port:
  - at 390 and 320 px: `/jobs` shows the date line on every card, no horizontal overflow, no console errors;
  - at 1440 px: the table looks as before (the Posted column, with no "Posted" word inside the cells).
  - Screenshots saved to the scratchpad.
