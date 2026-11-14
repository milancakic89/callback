# Feature: Privacy Policy and Terms of Service (public pages)

**Status:** Implemented in code on the branch `feature/interview-invitations`, 2026-11-13. `npm test` (121 files, 1169 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. On a production build (`next start`), a signed-out request for `/privacy` and `/terms` answers 200 with no redirect, `/acme` and `/dashboard` still go to `/sign-in`, the landing page's footer links both documents and the sign-up page carries the consent sentence. **Not done:** not committed, pushed or deployed (until it is, callback.rs has no policy to show Google); not read by a lawyer; not checked in a browser at phone width. No migration. Written for the Google OAuth app verification (a `calendar.events` scope needs a public homepage and a privacy policy on the same domain, [interview-invitations.md](./interview-invitations.md)), and because a site that holds CVs and signs people up needs both documents anyway. The text is a **draft written from what the code does, not legal advice**: see [What the owner must check](#what-the-owner-must-check).

## Decisions (agreed with the user, 2026-11-13)
- **Operator named on the pages:** Milan Cakic, a private person, Serbia. Contact for every privacy request and for the Terms: `callback.online@gmail.com`. These two values live in one place, `src/lib/legal/operator.ts`; the documents take them as a prop.
- **English only**, like the rest of the app (`<html lang="en">`). Google's reviewers read English.
- **Routes:** `/privacy` and `/terms`, open to every visitor, signed in or not. Both words were already reserved (no company can be called that), but they were **not in `APP_ROUTES`**, so `isWorkspacePath("/privacy")` was true and a signed-out visitor was redirected to `/sign-in`, where Google's reviewer would never reach the policy. They move into `APP_ROUTES` (`src/lib/companies/company.ts`); the reserved set, and so the database function `company_slug_valid`, does not change, and neither does `company.test.ts`'s check of it. `company.test.ts` itself demands that a new folder under `src/app` is listed there.
- **Static pages.** No data, no `Date`: "Last updated" is a constant written by hand (`LEGAL_LAST_UPDATED`), so the pages prerender (the `Date.now()` error of AGENTS.md cannot happen).
- **Where they are linked:** the landing page footer (Google wants the policy linked from the homepage), the footer of the two documents (each links to the other), and a sentence under the sign-up form's button.

## Structure
- `src/lib/legal/operator.ts`: `LEGAL_OPERATOR` and `LEGAL_LAST_UPDATED`.
- `src/components/legal/legal-document.tsx`: title, last updated, intro, a table of contents and the sections (`{ id, title, body }`), so the contents list cannot drift from the sections.
- `src/components/legal/legal-page-shell.tsx`: `PublicHeader`, the white card, `LegalFooter`.
- `src/components/legal/privacy-*.tsx` and `terms-of-service.tsx`: the text, split so no file passes 300 lines.
- `src/components/auth/legal-consent.tsx`: the sentence under Create account.
- `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`: thin, with `metadata`.
- Every component has a render test. The text is tested for the statements a reviewer looks for, so a later edit can't drop them silently (the Google Limited Use sentence, the cookie names, the rights, the complaint authority).

## What the Privacy Policy says, and where each fact comes from
| Statement | Source in the repo |
|---|---|
| No analytics, no advertising, no tracking cookies | `grep` finds none; the CSP (`next.config.ts`) allows scripts from our own origin only |
| Cookies: the sign-in session (`sb-…-auth-token`), `cb_pending_signup` (while choosing an account type), `cb_google_state` (while connecting Google) | `src/lib/auth/pending-signup.ts`, `src/lib/google/oauth.ts`, Supabase SSR |
| A candidate gives name, location, CVs and cover letters; an employer sees name, location, the date and the documents | `candidate_profiles`, [applicant-review.md](./applicant-review.md) |
| Smart Screening is a keyword check shown to the employer, no automated decision | [cv-screening.md](./cv-screening.md) |
| Files in Cloudflare R2, EU jurisdiction; database and sign-in in Supabase; e-mail through Gmail SMTP; server at Contabo, Europe | `R2_ENDPOINT`, [document-storage.md](./document-storage.md), `SMTP_HOST`, [deployment.md](../project-overview/deployment.md) |
| Withdrawing an application releases its documents | [callback-applications-in-table.md](./callback-applications-in-table.md) |
| Rate-limit counters hold an IP address, an account's id or, for signing in, choosing an account type and resetting a password, the email address typed in | `rate_limits` and `src/app/(auth)/actions.ts` (`sign-in:<ip>:<email>`, `account-type:email:…`, `forgot-password:email:…`), the in-memory counters keyed by account id (`src/lib/rate-limit.ts`), `getClientIp` |
| A candidate who joins the interview call does it on Google Meet, under Google's own privacy policy | `meet_url` from `src/lib/google/calendar.ts` |
| Google: only the account's e-mail and one calendar scope; creates its own events, adds the confirmed candidate, deletes them; refresh token encrypted (AES-256-GCM); Disconnect revokes and deletes | `src/lib/google/*`, [interview-invitations.md](./interview-invitations.md) |
| **No** self-service account deletion or data export | none exists: the policy says to write to the contact address, and does not promise a button |

## What the Terms say
Who runs the service; the two kinds of account; the candidate's and the employer's duties (an employer is its own controller of the CVs it receives, and may not use them for anything but the job); acceptable use; the licence to the content you upload (only to run the service); listings from other boards belong to their publishers; Google Calendar and Meet run under Google's terms; "as is", the service is free today and may change; ending an account; liability limited **except** what the law doesn't allow to be limited; Serbian law, with consumer rights untouched.

## What the owner must check
These are statements the code can't prove; they are in the text and need a human to confirm or change them:
- **The operator's status.** The text says "a private person". Selling services to businesses is usually done as a registered entrepreneur or company; if that changes, `LEGAL_OPERATOR` and the Terms' first section change with it.
- **Where Supabase's database runs** (the region of the project). The policy says providers may process data outside Serbia and the EEA under standard contractual clauses; if the region is in the EU, say so.
- **Retention.** The policy promises deletion on request and no fixed periods. `rate_limits` rows are never purged (they are overwritten per key), so addresses stay in that table; decide whether to add a purge.
- **The Serbian regulator and law references** (the Law on Personal Data Protection, the Commissioner at poverenik.rs) and the 30-day answer time.
- A lawyer's reading before the Google review, if the owner wants one.

## Update, 2026-11-13: what the counters hold, and Google Meet for candidates
**Status:** implemented on the branch `legal/privacy-update`, 2026-11-13. `npm test` (134 files, 1,251 tests, 3 of them new), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass, and `/privacy` is still a partial prerender (`◐`). No existing test was changed. Not committed, pushed or deployed.
- **A wrong sentence fixed.** "How long we keep it" said the counters that limit abusive traffic hold "an IP address and a number of requests, and nothing else". The sign-in, account-type and password-reset limits are kept in `rate_limits` under keys that include the email address typed in, and the other limits count per account id (in memory). Both "What we collect" and "How long we keep it" now say so. "What we collect" keeps its first sentence word for word, so its existing test is unchanged; a new test covers the added one.
- **Google Meet for candidates.** "Who sees your data" now says that the interview call itself happens on Google Meet, under Google's Privacy Policy (`GOOGLE_PRIVACY_POLICY_URL`, next to the other Google links in `privacy-google-section.tsx`). Part 5 still says candidates never sign in with Google.
- `LEGAL_LAST_UPDATED` stays "13 November 2026": the change is made the same day.

## Update, 2026-11-14: the candidate's confirmation email
**Status:** implemented on the branch `feat/candidate-confirmation-email`, 2026-11-14 ([interview-invitations.md](./interview-invitations.md), the last update). The Privacy Policy names the new email in both places that list the interview emails: "Emailing you" (the invitation, the confirmation the candidate gets once they confirm, and the answer the employer is told) and "When an employer invites you to an interview" (if you confirm, we email you again with the time and the Google Meet link). `LEGAL_LAST_UPDATED` is "14 November 2026".

## Out of scope
A Serbian translation; a cookie banner (only strictly necessary cookies are set); self-service account deletion and export (the policy names it as a request by e-mail); the Google verification submission itself.

## Verification
1. `npm test` (new tests), `npm run lint`, `npx tsc --noEmit`, `npm run build`: `/privacy` and `/terms` are partial prerenders (`◐`): the text is in the static shell, and only the header's account link, in its own Suspense boundary, is read per request.
2. `gateRedirect` lets `/privacy` and `/terms` through for a guest, a candidate, an employer and an employer without a company.
3. On a production build (`next start`), a signed-out `curl` of both pages answers 200 with no redirect, and the landing page's footer links to them.
