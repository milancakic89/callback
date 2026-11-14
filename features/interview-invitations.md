# Feature: Interview Invitations (Google Meet from the review screen)

**Status:** Implemented in code on the branch `feature/interview-invitations`, 2026-11-13. `npm test` (all files), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass, and the timer's command was run against a fake local server (a right secret succeeds, a wrong one fails, no secret is skipped). **Not done yet:**
- **The migration `supabase/migrations/20261113120000_interview_invitations.sql` is applied to the Supabase project (2026-11-13) and checked against it.** It was run by hand (not through `apply_migration`, which was declined), so the project's migration history (`list_migrations`) does not list it; the same is true of `candidate_steps` and the other recent migrations, whose objects exist in the database. The code must not be deployed to a database without it, because `my_job_applications()` and the new `schedules_interview` column come from it.
  - **Checked** (a test in one transaction that ended in an error, so nothing was kept; the row counts were the same afterwards): `create_interview_invitation` refuses a candidate not on an interview step (`P0001`), a time under 3 hours away and a length of 5 minutes (`23514`), an unknown time zone (`22023`), a second open invitation (`23505`), another company's application, a withdrawn application and a demo candidate (`P0002`); a valid call returns a deadline 2 days ahead, and a new one is allowed after a cancel. `cancel_interview_invitation` is refused to another company and returns the event id and `was_confirmed` to the owner. Another company and the candidate read no rows from `interview_invitations`; the owner reads their own but `token_hash` and `google_event_id` are `permission denied`, as are a direct insert and update; `google_calendar_connections` is `permission denied` for the owner; `anon` can't call the functions. `my_job_applications()` shows the candidate a `pending` invitation without the Meet link, the link once `confirmed`, nothing once `cancelled`, and `expired` for a `pending` one past its deadline. `save_company_steps` stores `schedules_interview`; `company_slug_valid('interviews')` is false.
  - **Not checked:** that `save_company_steps` leaves `updated_at` alone when only the flag changes (the whole test ran inside one transaction, where `now()` doesn't move).
- **Nothing was run against real Google or in a browser.** The Google calls are checked with a stubbed `fetch` only; the first real run (see [Manual Google setup](#manual-google-setup-by-the-project-owner)) is still to do.
- Not committed, not pushed.

## Where the code differs from the plan
- **The time zone is the browser's, shown and not chosen.** The dialog says "Time zone: Europe/Belgrade" under the time. It sends the instant (from the browser's own local time) and the zone's name; the email and the event show the time in that zone.
- **No `respond_my_interview` function.** The email's page and the signed-in candidate's Confirm and Decline share one function, `answerInvitation()` (`src/lib/interviews/respond.ts`), which reads the row with the secret-key client and checks the proof first: the token's hash, or `application.candidate_id = session user`. One path is easier to test and to keep correct than two.
- **A new top-level route, `/interviews`,** so it is in `APP_ROUTES` and `RESERVED_SLUGS`, and the migration replaces `company_slug_valid()` with `interviews` added. `company.test.ts` now reads the newest migration that defines that function. A company already called "interviews" would not be touched (a check runs on a row when it is written), but none exists.
- **Google's environment is optional.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` and `CRON_SECRET` can be missing: a release without them still deploys. Settings then says Google isn't set up on the server, and the Apply statuses dialog offers no invitation.
- **An invitation's stale row is closed by the next invitation.** A `pending` invitation past its deadline blocks the "one open invitation per application" index until the expiry job runs, so `sendInterviewInvitation()` closes such a row first (and a still-open one is refused with "Cancel it first").
- **Candidate answers in two places:** the email's page and the invitation block on the application panel in `/applications`.
- **Cancelling sends the candidate nothing of its own.** A candidate who had confirmed hears from Google (the event is deleted with `sendUpdates=all`); one who hasn't finds the link says "This interview was cancelled".

## Known limits
- **A candidate who withdraws the application** leaves a confirmed event in the company's calendar. The page says the invitation is no longer available, but nothing deletes the event.
- **A confirmed candidate Google couldn't invite** (the company's connection broke in between) is still confirmed in Callback. The company's email says to send them the Meet link, and the candidate's page shows it.
- **The primary calendar only.** Events go to the connected account's primary calendar.
- **No reminders and no rescheduling:** a different time is a new invitation.

## Context
On the review screen (`/{slug}/jobs/{id}/review`, [applicant-review.md](./applicant-review.md)) the employer sets a status and shows it to the candidate with **Apply statuses** (`applyApplicationStages` in `src/app/(employer)/[company]/actions.ts`, RPC `apply_application_stages`, [candidate-steps.md](./candidate-steps.md)). Today the candidate only sees the new step in `/applications`, and the employer has to leave Callback to arrange the call.

The goal: when the employer moves a candidate to a step that is an interview, the same Apply statuses dialog asks for a time. Callback then creates a Google Calendar event with a Meet link in the company's calendar, and emails the candidate to confirm or decline. Callback keeps the outcome either way: **confirmed, declined or no response**.

## Decisions (agreed with the user, 2026-11-13)
- **The company connects its own Google account.** The event is in the company's calendar, the company is the Meet organizer, and the candidate is a guest.
- **One time, Confirm or Decline.** The employer picks the date, time and length. The candidate can't pick another time.
- **Deadline:** 48 hours after the invitation is sent, and at the latest 2 hours before the interview. After that it is "No response".
- **No sign-in needed to answer.** The email link carries a one-time token. A signed-in candidate can also answer in `/applications`.

## The flow
1. **Settings → Candidate steps:** each step gets a switch, "Interview (sends a Google Meet invitation)".
2. **Settings → Google Calendar:** "Connect Google Calendar" (OAuth). Once connected, the card shows the Google email and "Disconnect".
3. **Review screen → Apply statuses:** in the dialog, every change to an interview step gets a row with:
   - the date, the time and the length (30 / 45 / 60 / 90 min);
   - the time zone (the browser's, shown);
   - an optional message to the candidate;
   - "Send a Google Meet invitation", checked by default.

   Without a Google connection the checkbox is disabled, with a link to Settings.
4. **After Confirm:**
   - the statuses are applied as today;
   - for each candidate with a time, an event with a Meet link is created in the company's calendar. The candidate is **not** a guest yet, so the event only holds the slot;
   - the candidate gets the email.
5. **The candidate** opens `/interviews/{id}?t={token}` from the email, sees the job, the company, the time and the length, and clicks **Confirm** or **Decline**:
   - **Confirm:** the candidate is added as a guest (`sendUpdates=all`), so Google sends them the real calendar invitation. The page shows the Meet link, the candidate gets a confirmation email with the same link (added 2026-11-14), and the company gets an email ("Ana Novak confirmed…").
   - **Decline:** the event is deleted from the company's calendar, and the company gets an email.
   - **No answer by the deadline:** the status becomes `expired`, and the event is deleted.
6. **The employer sees the outcome:**
   - in the playlist, as a calendar badge (Pending / Confirmed / Declined / No response);
   - in the ATS panel, in an "Interview" block: the time, the status, when they answered, the Meet link, **Cancel interview**, and **Send a new invitation** (after a decline, an expiry or a failure).
7. **A signed-in candidate** sees the same invitation with Confirm and Decline in their application panel (`src/components/applications/my-application-panel.tsx`).

## Database: `supabase/migrations/<ts>_interview_invitations.sql`
- **`company_steps.schedules_interview boolean not null default false`.** `save_company_steps()` is replaced (`create or replace`, same signature) and reads the new key from each item.
- **`google_calendar_connections`:** `company_id` (primary key), `google_email`, `refresh_token_ciphertext`, `connected_by`, `connected_at`, `broken_at`.
  - RLS on, no policies, `revoke all`. Only the secret-key client reads or writes it, after the server checks ownership.
- **Enum `interview_status`:** `pending`, `confirmed`, `declined`, `expired`, `cancelled`.
- **`interview_invitations`:** `id`, `application_id` (fk, cascade), `company_id`, `step_id`, `starts_at`, `duration_minutes` (check 15–240), `time_zone`, `message` (≤ 1000), `status`, `expires_at`, `token_hash bytea unique`, `responded_at`, `google_event_id`, `meet_url`, `created_by`, `created_at`.
  - `expires_at = least(created_at + 48h, starts_at - 2h)`. A check keeps `starts_at` at least 3 hours ahead (otherwise there is no window to answer in) and at most 90 days ahead.
  - A partial unique index allows at most one `pending` or `confirmed` invitation per application.
  - **Reads go through RLS:** the job's owner (through `job_postings → companies.owner_id`) and the candidate (through `job_applications.candidate_id`). **The select grant leaves out `token_hash`.**
  - **Writes go only through security definer RPCs:** `create_interview_invitation` and `cancel_interview_invitation` for the owner, `respond_my_interview` for a signed-in candidate. An answer by token goes through the secret-key client.
- `my_job_applications()` also returns the latest invitation: its status and time, and the Meet link only once it is confirmed.

## Code

### Google (plain `fetch`, no `googleapis` package)
- **`src/lib/google/oauth.ts`** (`server-only`):
  - `authUrl(state)` with the scopes `openid email https://www.googleapis.com/auth/calendar.events.owned` (was `calendar.events`, see the update at the end), `access_type=offline` and `prompt=consent`;
  - `exchangeCode()` and `accessToken(refreshToken)`;
  - an `invalid_grant` answer sets `broken_at`, and Settings then shows "Reconnect".
- **`src/lib/google/calendar.ts`:**
  - `createInterviewEvent()` sends `POST calendars/primary/events?conferenceDataVersion=1&sendUpdates=none` with `conferenceData.createRequest` (`hangoutsMeet`, `requestId` = the invitation's id). It returns `eventId` and `hangoutLink`.
  - `addAttendee(eventId, email)` sends a PATCH with `sendUpdates=all`.
  - `deleteEvent(eventId, notify)` deletes the event.
- **`src/lib/google/token-crypto.ts`:** AES-256-GCM with `GOOGLE_TOKEN_KEY`. Look at how `src/lib/auth/pending-signup.ts` encrypts its cookie first, and reuse that approach.

### Routes and actions
- **`src/app/api/google/connect/route.ts`:** `requireAccountType("employer")`, a signed `state` cookie, then a redirect to Google.
  - Settings links to it with a **link, not a form**: the CSP's `form-action 'self'` blocks a form's redirect to Google.
- **`src/app/api/google/callback/route.ts`:** checks `state`, exchanges the `code`, stores the encrypted refresh token, and redirects back to `/{slug}/settings`.
- **`src/app/(employer)/[company]/(workspace)/settings/actions.ts`:** a new `disconnectGoogle` (revoke, then delete), and `schedules_interview` in `saveCandidateSteps`.
- **`src/app/interviews/[invitationId]/page.tsx`:** a public page (the route gate doesn't protect it), with `Cache-Control: no-store`.
  - The token is read from `searchParams` inside `<Suspense>`, because of `cacheComponents`.
  - The server compares `sha256(token)` with `token_hash`, in constant time.
  - A wrong token or id answers 404.
- **`src/app/interviews/[invitationId]/actions.ts`:** `respondToInterview(id, token, "confirm" | "decline")`.
  - It checks the token, `pending` and the deadline again, then changes the status and does the Google step.
  - **An answer is only ever a POST from the page's form, never the email link itself.** Mail scanners (Outlook Safe Links, Gmail) open the links in an email, and would otherwise confirm invitations on their own.
  - Rate limited per IP and per invitation.
- **`src/app/api/interviews/expire/route.ts`:** a POST with `CRON_SECRET`. It moves every `pending` invitation past its `expires_at` to `expired` and deletes its Google event.
  - A new `deploy/callback-interviews.timer` calls it every 15 minutes, like `callback-scraper.timer`.
  - Until it has run, the UI shows a `pending` invitation past its deadline as "No response".

### Review screen
- **`applyApplicationStages(jobId, changes, interviews)`** gains a zod array of `{ applicationId, startsAt, durationMinutes, timeZone, message?, sendInvite }`. In order:
  1. the existing RPC;
  2. for each applied id, an RPC creates the `pending` row and returns the token;
  3. the Google event is created, and its `event_id` and `meet_url` are stored;
  4. the email is sent.
- **The result is per candidate.** If Google or the mail fails, the status stays applied, the invitation is cancelled, and the dialog and the ATS panel offer "Send a new invitation". Limit: 30 invitations an hour per company.
- **New actions for the ATS panel:** `sendInterviewInvitation` and `cancelInterview`.
- **UI changes:**
  - `src/components/review/apply-stages-button.tsx`: the time rows in the dialog;
  - `src/components/review/ats-panel.tsx`: the "Interview" block;
  - `src/components/review/candidate-playlist.tsx`: the status badge;
  - `src/components/employer/candidate-step-row.tsx`: the interview switch;
  - the Settings page: the "Google Calendar" card.

### Email (`src/lib/mail.ts`)
- **`sendInterviewInvitationEmail`** sends the candidate the time in the company's time zone (with the zone's name), the length, the company's message and a "Respond to the invitation" button.
- **`sendInterviewResponseEmail`** tells the company the candidate confirmed or declined.
- **`sendInterviewConfirmedEmail`** (added 2026-11-14, see the last update) sends the candidate, after Confirm, the time, the length, the Meet link and a "Join on Google Meet" button, and says where Google's calendar invitation comes from.
- **The job title, the company name and the message are user text, so they must be HTML-escaped.** The existing templates never needed it: they only insert a URL.

### Environment (`src/lib/env.ts`, `.env.example`)
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY` (≥ 32 characters) and `CRON_SECRET` (≥ 32 characters).

### Docs
- `project-overview/security.md`: the encrypted refresh token, the minimal scope, the hashed token, and why the answer is a POST.
- `project-overview/deployment.md`: the new timer and the new variables.
- `project-overview/roadmap.md`: an entry for this feature.

## Manual Google setup (by the project owner)
1. In the Google Cloud Console, create a project and enable the **Google Calendar API**.
2. OAuth consent screen: type External; scopes `openid`, `email` and `calendar.events.owned`; add test users.
3. Create an OAuth client (Web application). Redirect URIs: `http://localhost:3000/api/google/callback` and `https://callback.rs/api/google/callback`.
4. **Before production:** `calendar.events.owned` is a sensitive scope, so Google has to verify the app (a verified `callback.rs` domain, a privacy policy and a video demo; it takes days to weeks; the policy and the Terms are [legal-pages.md](./legal-pages.md), at `/privacy` and `/terms`, once deployed). Until then only test users can connect (at most 100), and their refresh tokens expire after 7 days.

## Verification
1. `npm test` with the new tests, `npm run lint`, `npx tsc --noEmit` and `npm run build`. The new unit tests cover:
   - the `expires_at` computation and the limits on the time;
   - hashing and checking the token;
   - how the Google requests are built (with a mocked `fetch`);
   - the zod schemas;
   - that `gateRedirect` lets `/interviews/*` through;
   - the actions, like the existing `*.test.ts` files.
2. RLS, through the Supabase MCP:
   - another company can't see the invitation;
   - a candidate sees only their own;
   - `token_hash` can't be read by any client;
   - `google_calendar_connections` can't be read, not even by its owner.
3. In a browser, with a Google test account:
   - Connect Google, mark a step as an interview, and apply a status with a time. The event with a Meet link shows in the company's calendar, and the email reaches the candidate.
   - Opening the email link **only shows the page and confirms nothing** (a curl GET without the POST leaves the status unchanged).
   - Confirm: the status is `confirmed`, the candidate gets the Google invitation, the company gets the email, and the review screen shows "Confirmed" and the Meet link.
   - Decline: the status is `declined`, and the event is gone.
   - Expiry: move `expires_at` into the past with SQL and call `/api/interviews/expire`. The status is `expired`, and the event is gone.
   - A wrong token answers 404. Opening the page again after answering shows the answer and changes nothing.
   - Cancel interview, from the employer's side.
   - Disconnecting Google disables the checkbox in the dialog.

## Update, 2026-11-13: the narrower scope `calendar.events.owned`
**Status:** implemented on the branch `fix/google-narrower-scope`, 2026-11-13. `npm test` (1,251 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. Two existing tests changed because the scope changed on purpose: `oauth.test.ts` expects the new scope list, and `privacy-google-section.test.ts` pins the new scope and its "calendars the account owns" sentence. Not yet checked against real Google with the new scope.

**Why.** Google's verification of a sensitive scope asks for the narrowest scope the app needs, and for a justification of why a narrower one would not work; a broader scope is sent back. `calendar.events` is "view and edit events on all calendars", while Callback only works on the connected account's own primary calendar (`calendars/primary/events` in `src/lib/google/calendar.ts`). `calendar.events.owned` ("view, create, change, and delete events on owned calendars") is accepted by every call the app makes: `events.insert` (with `conferenceDataVersion=1` for the Meet link), `events.get` (the second read for the Meet link), `events.patch` (adding the confirmed candidate) and `events.delete` (checked in Google's Calendar API reference on 2026-11-13).

**Why not narrower still.** `calendar.app.created` only reaches secondary calendars the app creates. The interview would then sit in a separate "Callback" calendar instead of the employer's primary one, the employer's availability on the primary calendar would not show it, and the candidate's invitation would come from that secondary calendar's address instead of the employer's own account.

**What changes.**
- `GOOGLE_SCOPES` in `src/lib/google/oauth.ts`: `openid email https://www.googleapis.com/auth/calendar.events.owned`; `oauth.test.ts` expects the new list (the behaviour changes on purpose).
- The Privacy Policy's Google part names the new scope and says it covers only calendars the account owns; its test pins the new scope.
- This file and `project-overview/security.md` name the new scope.
- **By hand, in the Google Cloud Console:** on Data Access, remove `calendar.events` and add `calendar.events.owned`. Every employer connects again (Settings, Reconnect) so its token carries the new scope; a token granted the old, broader scope keeps working until then.

**Google verification, step by step (by the owner).**
1. Deploy this change, then connect Google Calendar again on callback.rs.
2. Google Auth Platform, Data Access: only `openid`, `email` and `calendar.events.owned`; paste the justification.
3. Google Auth Platform, Audience: publish the app (In production).
4. Record the demo video (in English, the consent screen's language set to English) and upload it to YouTube as unlisted.
5. Verification Center: submit, then answer Google's emails.

## Update, 2026-11-14: Google's reason for a refused calendar call
**Status:** implemented on the branch `fix/google-meet-403`, 2026-11-14. `npm test` (1,261 tests), `npm run lint`, `npx tsc --noEmit` and `npm run build` pass. No existing test changed. Not yet checked against real Google: the reason shows in the log only after a deploy and one more invitation.

**Why.** No invitation has ever gone out on callback.rs: every `events.insert` since the first try (2026-11-13 21:56) is refused with 403, and the log shows only `Creating the event failed (403)`. Connecting works, which proves nothing about the calendar: the OAuth trip doesn't touch the Calendar API. Google's 403 body names the cause, and `src/lib/google/calendar.ts` throws it away. The usual causes, by their reason codes: `ACCESS_TOKEN_SCOPE_INSUFFICIENT` / `insufficientPermissions` (the token has no calendar scope, e.g. its checkbox left unticked on Google's consent screen), `SERVICE_DISABLED` / `accessNotConfigured` (the Calendar API is off in the Cloud project), `forbidden` / `requiredAccessLevel` (no write access to that calendar). The Calendar API is on (checked by the owner, 2026-11-14), so the log has to tell the rest.

**What changes** (`src/lib/google/calendar.ts` only; what the employer reads stays the same, only the log gets the reason).
- `GoogleCalendarError` gets a third field, `reason: string | null` (default `null`), next to `status`.
- One function builds the error for a refused call from the response and the action's name ("Creating the event", "Adding the guest", "Deleting the event"). It reads the body best effort (a body that isn't JSON gives no reason): the reason is the first `error.details[].reason` (Google's `ErrorInfo`), else `error.errors[0].reason`; Google's text is `error.message`. The message is `<action> failed (<status>)` as today, followed by `: <reason>, <Google's text>` when Google gave them. Nothing else from the body (its `metadata` names the Cloud project) is kept.
- The insert, `addAttendee` and `deleteEvent` throw that error. The second `events.get` for a late Meet link stays best effort, as now.

**Tests** (`calendar.test.ts`: new tests only, the existing ones keep passing because the message keeps its prefix).
- A 403 with an `ErrorInfo` reason gives `status`, `reason` and a message with Google's text.
- A 403 with only `errors[0].reason` gives that reason.
- A body that isn't JSON gives `reason: null` and the message `Creating the event failed (403)`.
- `addAttendee` and `deleteEvent` carry the reason as well.

**Then (by the owner):** deploy, try one invitation, and read the reason with `journalctl -u callback --since "10 minutes ago" --no-pager | grep -A8 createInterviewEvent`.

**Outcome (2026-11-14).** The log said `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT`: the saved token had no calendar grant. Connecting again, with the calendar box ticked on Google's consent screen, fixed it, and invitations go out with `calendar.events.owned`, Meet link included. So the narrower scope does create Meet events. The callback still saves a connection whatever Google granted; checking the returned `scope` would catch this at once (not done yet).

## Update, 2026-11-14: the candidate's confirmation email, and where the calendar invitation comes from
**Status:** implemented on the branch `feat/candidate-confirmation-email`, 2026-11-14. `npm test` (134 files, 1,284 tests), `npm run lint` and `npx tsc --noEmit` pass; `npm run build` was not run. One existing assertion gained a key: the `toEqual` of the whole view in `respond.test.ts` ("shows the invitation to whoever has the token") lists `organizerEmail: null`, because the view has a new field. The Privacy Policy lists the emails Callback sends, so it names the new one too (`privacy-data-sections.tsx`, with two new tests); its "Last updated" date is unchanged. Not checked against real Google or a real mailbox.

**Why.** In the first real test the Google Calendar invitation landed in Spam, and Gmail doesn't add an invitation that is in Spam to the calendar, so the interview wasn't in the candidate's calendar until it was moved to the inbox. Google sends it from the connected Google account (the event's organizer), which a candidate has usually never written to: Gmail shows "invitation from an unknown sender" and is strict with those. Callback can't change that. But after Confirm, Callback sent the candidate nothing: the Meet link was only on the page and in Google's invitation, so a candidate who closed the page and whose invitation went to Spam had no link.

**What changes.**
- **`src/lib/mail.ts`:** `sendInterviewConfirmedEmail` to the candidate, in the same layout (`sendLayoutEmail`). Subject `Interview confirmed: <job> at <company>`, heading "Your interview is confirmed"; the paragraphs: `Hi <name>,`, that they confirmed the interview with the company for the job, `When:` and `Length:` (as in the invitation email), `Google Meet: <link>` when there is one, and one sentence about the calendar invitation:
  - Google added them: "Google Calendar is sending you an invitation from <organizer email>. If it isn't in your inbox, look in Spam: moving it to the inbox puts the interview in your calendar." (without "from <organizer email>" when the address isn't known);
  - Google couldn't add them (`calendarInviteFailed`): "Google could not send you a calendar invitation, so keep this email: the link above is the one to join."
  The button is "Join on Google Meet" with the Meet link, and no button without one.
- **`src/lib/interviews/respond.ts`:**
  - `answerInvitation`, on Confirm only: the candidate's address is read before the Google step (it is already read there, for `addAttendee`), so the email can go even when Google fails. After the Google step and next to the company's email, the candidate's email goes, best effort: a failure is logged (`answerInvitation: the candidate's confirmation email failed:`) and doesn't change the answer or the company's email. `when` and `duration` are formatted with `formatInterviewTime` and `formatDuration` (`./format`).
  - The organizer's address is the connected account's email, from `getGoogleStatus(company_id)` (`src/lib/google/connection.ts`, already there). It is read only for a confirmed invitation, and an error reading it leaves it `null`.
  - `InvitationView` gets `organizerEmail: string | null`, set only when confirmed (like `meetUrl`). `toView` takes it as a parameter (it stays a plain function); `loadInvitationView` and `answerInvitation` pass it.
- **`src/components/interviews/interview-response.tsx`**, the confirmed state: "<company> has been told. Google is sending you a calendar invitation from <organizer email>. If it isn't in your inbox, look in Spam." (without "from …" when it is `null`).
- This file's emails list names the new email; the Privacy Policy is checked for a list of the emails Callback sends, and the new one added if there is one.

**Tests** (new tests; existing tests keep their assertions. Adding the new functions to the existing `vi.mock` factories in `respond.test.ts` is the only change to an existing test file's setup.)
- `mail.test.ts`: the confirmed email has the time, length and Meet link and the button; the Spam sentence names the organizer; without an organizer, no "from"; with `calendarInviteFailed`, the "keep this email" sentence and not the Spam one; no Meet link, no button; user-typed names escaped.
- `respond.test.ts`: Confirm sends the candidate's email with the organizer and `calendarInviteFailed: false`; Google failing still sends it with `calendarInviteFailed: true`; the email failing still returns `ok` and still emails the company; Decline sends the candidate nothing; the view has `organizerEmail` only when confirmed.
- `interview-response.test.ts`: the confirmed state names the organizer and Spam, and leaves out "from" when there is no organizer.
