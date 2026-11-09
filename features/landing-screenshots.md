# Feature: Real Fast Manual Mode screenshots on the landing page

**Status:** Implemented (2026-11-09), branch `feature/landing-screenshots`, committed nowhere yet. The six screenshots were taken from the real review screen of a throwaway employer account (made through the admin API and deleted afterwards; its company, job and applications went with it, the three mock candidates stayed). `npm test` (679 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass; `/` is still static. Checked in Chromium at 1440, 1024, 768, 390 and 320px (no horizontal overflow, no console errors, the tabs work by click and by ← / →), and on a production build (`next start`) under the real CSP: the images load through `/_next/image` as webp, and only the size that shows is downloaded. **Not checked:** Safari and Firefox.

## Why
The landing page shows Fast Manual Mode through two hand-built look-alikes: `review-demo.tsx` (the
interactive demo in the Fast Manual section) and `hero-visual.tsx` (the hero's product shot). Neither
is the real screen. The real one ([applicant-review.md](./applicant-review.md), [application-status.md](./application-status.md))
has four columns: the playlist of applicants, the CV, the cover letter (small, wide on hover) and the
screening overview with the status control, the heart and Next. The look-alikes have none of that, so
a visitor who signs up meets a different product from the one the page showed.

## Decisions
- **Real screenshots of the real screen**, taken from a signed-in employer's demo job (the three
  fictional candidates every company starts with, [demo-job.md](./demo-job.md)). Nothing on them is
  made up beyond the sample data the product already ships with.
- **How they are taken:** `scripts/capture-landing-screenshots.ts` (`npm run landing:screenshots`),
  Playwright Chromium against a running app, like `npm run demo:documents`. The account comes from
  `LANDING_SCREENSHOT_EMAIL` and `LANDING_SCREENSHOT_PASSWORD`, never from the code. Output:
  `public/landing/*.webp`, committed. Re-run it whenever the review screen changes.
- **webp, not avif.** `src/proxy.ts` leaves `svg|png|jpg|jpeg|gif|webp|ico` out of its matcher, so
  those are served straight; an `.avif` in `public/` would go through the proxy.
- **Replace both look-alikes.** The Fast Manual section shows the screenshots, and the hero's product
  shot is the real screen too (its "application update" card stays as it is).
  `review-demo.tsx` and the hero's fake workspace are deleted. `sample-documents.tsx` stays: the
  demo PDFs, `/dev/documents` and the mock candidates are built from it.
- **Sizes are fixed in code** (`width` / `height` on `next/image`) so nothing shifts while loading;
  `alt` text says what is on the screen. Only the first screenshot (hero) is `priority`.
- **Throwaway account.** An employer account is made for the capture through the admin API (local
  and production share one Supabase project), the screenshots are taken, and the account is deleted;
  its company, job and applications go with it (cascade), and the three mock candidates stay.
- **Copy:** the Fast Manual text is rewritten to describe what the screenshots show, and the
  "illustrative demo, fictional candidates" caption stays honest: the candidates are fictional.

## Plan
1. Branch `feature/landing-screenshots` (done).
2. Throwaway employer account, company set up, demo job seeded; a few candidates marked (liked,
   viewed, a status) so the screenshots show those parts.
3. `scripts/capture-landing-screenshots.ts`: sign in, open the review, wait for the PDFs to be drawn,
   shoot at 1440 wide (and a narrow view for the phone layout if it adds something).
4. `src/components/landing/review-screenshots.tsx` (a switcher over the shots, client) and the hero
   using the first shot; delete `review-demo.tsx`, trim `hero-visual.tsx`; `landing.css` loses the
   classes only the demo used.
5. Tests (render tests in the style of `for-candidates.test.ts`): every screenshot has `alt`, a size
   and a file that exists in `public/`.
6. Update [landing.md](./landing.md) (page structure, the demo section, files).
7. Check in Chromium at 1440 / 768 / 390 / 320 (no horizontal overflow), then `npm test`,
   `npm run lint`, `npx tsc --noEmit`, `npm run build`.
8. Delete the throwaway account.

## Out of scope
- Videos / animated captures; an Open Graph image; changing the review screen itself.
