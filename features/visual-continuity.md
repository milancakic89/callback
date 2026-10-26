# Feature: Visual Continuity Between the Landing Page and the App

**Status:** Implemented. `npx tsc --noEmit`, `npm run lint` and `npm run build` pass. Checked in Chromium (1440 and 390px) on a production build: the landing → `/jobs` → `/sign-up` funnel, the dark auth pages (including a field-validation error and focus ring), the shared nav and its mobile menu, and the light-app pieces (lime button, checked checkbox, active sidebar item, ink table header) rendered with the real compiled CSS. **Not checked:** the signed-in pages themselves (need an account), Chrome autofill on the dark form, and `/reset-password` (reachable only from a recovery email).

The landing page ([landing.md](./landing.md)) is dark with a lime accent. Every other page is white, with a black primary button, an indigo table header and a blue logo. This plan makes the pages a visitor reaches from the landing page look like the same product, and gives the whole app one accent colour. The signed-in app stays light.

## Context
- **The first click looks like a different product.** Every landing CTA leads to a white page: "Find a job" → `/jobs`, "Get started" → `/sign-up`, "Log in" → `/sign-in`.
- **There are three accents.** Lime on the landing, `bg-indigo-600` on the table header (`HEADER_CLASS` in `src/components/jobs/table-parts.tsx`), and a neutral black `--primary` for buttons. That signals "two products" more than the dark/light split does.
- **Approach (option B from the discussion).** Keep marketing dark, make the pre-sign-in pages match it, and move the dark → light switch to after sign-in. Use lime as the single accent everywhere. A full dark mode for the app is a separate, later feature.

### Decisions
- **Dark:**
  - `/` (already);
  - the auth pages `/sign-in`, `/sign-up`, `/forgot-password` and `/reset-password`;
  - the top nav on `/jobs`.
- **Light:** the `/jobs` content (search, filters, table) and the signed-in app (`/dashboard`, `/saved-jobs`, `/applications`).
- **Lime is the only accent, used as a fill, never as text on white.** Lime `#c6f24e` on white has a contrast ratio of about 1.3:1. In light UI it appears as:
  - primary buttons (dark text on lime, about 15:1);
  - the checked Applied checkbox;
  - the active sidebar item's tint.

  Text and icons on white stay `foreground`. On dark surfaces lime can also be text, as on the landing page. The auth pages use that for their confirmations ("We've sent your activation link…", "…we've sent a reset link"): the `success` variant of `Alert` in `src/components/ui/alert.tsx` is lime text with a faint lime border and tint and a check icon, so a message there isn't missed. Errors keep the red `destructive` variant. The variant is for dark surfaces only.
- **The table header becomes near-black ink** (the landing's surface colour) with white text, instead of indigo.
- **The logo stays as it is** (blue mark). Dark surfaces use `<Logo onDark />`.
- **One set of dark tokens.** `.dark` in `globals.css` is unused by the app today, so it is retuned to the landing palette. The auth pages and the shared nav use those tokens through the shadcn components. `landing.css` keeps its own `--l-*` variables with the same values.

## Implementation

### 1. Tokens: `src/app/globals.css`
- In `:root`, set `--primary` to the landing lime and `--primary-foreground` to near-black (`#0b0d05`). Convert both to `oklch` to match the file. Leave `--ring` neutral: a lime focus ring is invisible on white.
- Retune `.dark` to the landing palette:

  | Token | Value |
  |---|---|
  | background | `#09090b` |
  | card / popover | `#131317` |
  | muted / secondary / accent | `#1a1a1f` |
  | foreground | `#ededeb` |
  | muted-foreground | `#a1a1a8` |
  | border | `rgb(255 255 255 / 0.08)` |
  | input | `rgb(255 255 255 / 0.12)` |
  | primary | lime |
  | primary-foreground | `#0b0d05` |
  | ring | lime |

- Keep overscroll and the area behind the page dark with `html[data-surface="dark"] { background-color: …; color-scheme: dark; }`. **Changed from the first draft** (`html:has([data-surface="dark"])`): Next keeps the previous page mounted but hidden after a client navigation (React `<Activity>`, see `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`), so with `:has()` the landing page kept `<html>` dark after the click to the light `/jobs`. The pages now render `<DarkSurface />` (`src/components/dark-surface.tsx`), a layout effect that sets `data-surface` on `<html>` and removes it when the page is hidden.
- Add dark autofill styling inside `.dark`. Chrome paints autofilled inputs light blue, which looks broken on a dark form. Override it with an inset `box-shadow` in the input colour plus `-webkit-text-fill-color: var(--foreground)`.

### 2. `text-primary` on white
These would turn into lime text on a light background:
- `src/components/dashboard/sidebar-nav.tsx:32`: the active item `bg-primary/10 text-primary` becomes `bg-primary/25 text-foreground`.
- `src/components/jobs/jobs-table.tsx:259` and `src/components/applications/applications-table.tsx:214`: `hover:text-primary` becomes `hover:text-foreground`. The titles already underline on hover.
- The `link` variants in `ui/button.tsx` and `ui/badge.tsx` use `text-primary` but nothing in the app uses them. Leave the generated files alone, and don't use `variant="link"` on light surfaces.

Two changes beyond the plan's first draft, both in the checked state (`src/components/ui/checkbox.tsx`, `src/components/jobs/applied-checkbox.tsx`):
- A lime checkbox on white needs an edge (lime vs white is about 1.3:1, under the 3:1 WCAG asks of a control's boundary), so `data-checked:border-primary` became `data-checked:border-primary-foreground/50`.
- The Applied checkbox is disabled for good once applied, and `disabled:opacity-50` would fade the lime fill to almost nothing. `AppliedCheckbox` sets `disabled:opacity-100` once `applied`; while a request is pending it keeps the 50%.

Default-variant (lime) buttons after the change:
- the four auth submit buttons, which end up on dark pages;
- "Yes, I applied" (`AlertDialogAction` in `apply-confirm-dialog.tsx`).

Every other `Button` in the app has an explicit `outline` or `ghost` variant. The Applied checkbox (`ui/checkbox.tsx`, `data-checked:bg-primary`) becomes lime with a dark tick.

### 3. Dark auth pages: `src/app/(auth)/layout.tsx`
- Add `className="dark bg-background text-foreground"` and `data-surface="dark"` to the root `<main>`. The `dark` class switches every shadcn component inside to the `.dark` tokens and turns on their existing `dark:` variants (inputs already have `dark:bg-input/30`).
- `<Logo onDark className="h-7" />`, wrapped in a `Link` to `/`, so there is a way back to the landing page.
- Optionally add the landing's soft top light behind the card. Copy the radial gradient into a small class in `globals.css`, not into `landing.css`, which only loads on `/`.
- Check inside the card in dark:
  - `AuthCard` (`ring-foreground/10`; `shadow-md` disappears on dark, which is fine);
  - `FormAlert` and `FieldError` (destructive tokens exist in `.dark`);
  - the muted links ("Forgot password?", the footer link).

### 4. Shared top nav for `/` and `/jobs`
- Move `src/components/landing/site-nav.tsx` to `src/components/site-nav.tsx`. The landing page imports it from there.
- Make it independent of `landing.css`: put `dark` on the `<header>` and replace the `--l-*` classes with token classes. The background is opaque (`bg-background`), not the landing's translucent blur: over the white `/jobs` page a translucent dark bar turns grey.
  - `bg-background/70`, `border-border`;
  - `text-muted-foreground hover:text-foreground`;
  - Get started: `bg-primary text-primary-foreground`.

  It then renders the same on any page.
- Links:
  - `/#product`, `/#candidates`, `/#employers`. On `/` these are same-page fragment jumps; from `/jobs` they navigate home.
  - Add **Jobs** → `/jobs`, with `aria-current="page"` there (`usePathname`; the nav is already a client component).
  - `landing.css` turns on `scroll-behavior: smooth` for in-page jumps while a dark page is shown. Next 16 no longer suspends smooth scrolling during route changes by default, so `src/app/layout.tsx` sets `data-scroll-behavior="smooth"` on `<html>` to get that back (a new page opens at the top instead of scrolling there).
- `src/app/jobs/page.tsx`:
  - replace the inline header with `<SiteNav />`;
  - widen `<main>` to the nav's container (`max-w-[1200px] px-4 sm:px-6 lg:px-8`), so the logo and the table share left and right edges;
  - drop the now-unused imports (`Logo`, `buttonVariants`).

  The rest of the page stays light. Check that nothing in `JobsExplorer` is sticky and could clash with the sticky nav.

### 5. Table header: `src/components/jobs/table-parts.tsx`
- `HEADER_CLASS`: `bg-indigo-600 text-white dark:bg-indigo-700` becomes `bg-foreground text-background dark:bg-muted dark:text-foreground`. In light that is near-black ink.
- The sort controls' `text-white`, `text-white/50` and `hover:text-white/80` become `text-background`, `text-background/50` and `hover:text-background/80`.
- One constant covers every table: `jobs-table.tsx` (`/jobs`, `/dashboard`, `/saved-jobs`) and `applications-table.tsx` (`/applications`) both use `HEADER_CLASS`.

### 6. Docs
- `project-overview/architecture.md` "Layout": the auth pages are dark, `/jobs` shares the landing's nav, and the app is light with a lime accent.
- `features/landing.md`: the nav is shared (`src/components/site-nav.tsx`), and the html background rule moved to `globals.css`.

## Verification
- `npm run build`, `npm run lint` and `npx tsc --noEmit` pass. `/`, `/jobs` and the auth routes render the same way as before.
- **The funnel, signed out, at 1440px and 390px:**
  - landing → "Find a job" gives `/jobs` with the dark nav, a light table, a near-black table header, and aligned edges;
  - landing → "Get started" gives a dark `/sign-up`;
  - "Log in" gives a dark `/sign-in`, and "Forgot password?" a dark `/forgot-password`.
  - No white flash on overscroll on the dark pages.
- **Auth form states on dark:** a wrong password (FormAlert), an empty or invalid field (FieldError), the pending button text, and a Chrome-autofilled email and password.
- **Signed in:**
  - the dashboard table header is ink;
  - ticking Applied shows a lime checkbox;
  - the "Yes, I applied" dialog button is lime;
  - the active sidebar item has a lime tint with dark text.
  - Needs an account, so click through by hand.
- **No lime text on white:** grep `text-primary` outside dark scopes, and spot-check focus rings on light pages (still neutral).
- `/reset-password` can only be opened from a recovery email. Check it once with a real reset.

## Out of scope
- Dark mode for the signed-in app (option C), with a theme toggle. `.dark` tokens tuned here are its starting point.
- Emails (`src/lib/mail.ts`), the logo itself, and the landing page's own design.
