# Feature: Account Types (Candidate / Employer)

**Status:** Implemented. `npx tsc --noEmit`, `npm run lint` and `npm run build` pass. The migration `supabase/migrations/20261025180000_account_types.sql` was applied on 2026-10-25 (remote version `20261025194831`): no account is left without a type, and only `service_role` can execute `account_for_email`. Checked on a production build with throwaway users that were deleted afterwards. The activation email itself was not sent during testing (the checks avoided sending mail to fake addresses), so a real end-to-end run with an inbox is still to do. See "Verification".

Every account is either a **candidate**, who looks for work and uses the existing routes, or an **employer**, who posts jobs and has a separate area under `/employer`. After sign-up a dialog asks which one. It can't be dismissed, and the activation email is only sent once a type is chosen. Leaving without choosing brings the dialog back at the next sign-in. Once the account is active, the user lands on their own dashboard, and the type no longer changes.

## Decisions
- **Where the type lives.** It is stored in `app_metadata.account_type` (`"candidate" | "employer"`).
  - Only the secret-key client can change it; `user_metadata` would be user-editable.
  - It rides in the JWT, so proxy routes on it straight from `getClaims()`.
  - `parseAccountType()` treats anything missing or unknown as `candidate`. That covers accounts from before this feature and their not-yet-refreshed JWTs, and it is the side with less access.
- **Who may choose before there's a session.** That is whoever holds the `cb_pending_signup` cookie (`src/lib/auth/pending-signup.ts`).
  - The cookie is AES-256-GCM encrypted with `AUTH_COOKIE_SECRET`, `httpOnly`, `SameSite=Lax`, and lasts 1 hour. It holds `{ uid, email, exp }`.
  - It is set only when we know the person owns the account: right after `signUp` created it, or when `signIn` got `email_not_confirmed`. Supabase returns that only for the right password; tested: a wrong password on an unconfirmed account gives `invalid_credentials`.
- **The dialog is driven by that cookie alone.** `AccountTypeGate` in the auth layout renders it while the cookie exists. Setting or clearing a cookie in a Server Action re-renders the page, so the dialog opens after sign-up, survives a reload, and closes once a type is chosen.
- **No account enumeration, as before.**
  - Signing up with an email that already has an active account still opens the dialog, with `uid: null`. Choosing then does nothing, but ends with the same "activation link sent" notice.
  - A sign-up for an existing *unactivated* account gets a real `uid` only if the password matches. `generateLink` succeeds for such accounts without changing their password (tested), so a stranger can't pick someone else's type.
  - The cookie is encrypted rather than signed, so the decoy can't be spotted by decoding it.
- **The activation link is sent only after the choice.**
  - `chooseAccountType` saves the type, then `generateLink({ type: "magiclink" })`.
  - Verifying that token as `type=email` confirms the email and starts a session (tested).
  - The email links to `/auth/confirm?type=email&next=/dashboard|/employer`. `/auth/confirm` also falls back to the user's home when `next` is missing.
- **The dialog can't be dismissed.** It has no close button, and Escape and outside clicks are ignored.
  - The one way out is "Wrong email? Start over", which clears the cookie and returns to `/sign-up`. It doesn't skip the choice; it abandons this sign-up. Without it, a mistyped email would lock the auth pages for an hour.
- **The type is final once active.** Before activation the latest choice wins. Afterwards `chooseAccountType` leaves an active account's type alone.
- **Existing accounts became candidates**, through the migration's backfill.
- **The employer area is a placeholder.** `/employer` has its own sidebar and an empty state, because posting jobs and reviewing candidates don't exist yet.

## Flow
1. **Sign up.** `signUp` calls `generateLink({ type: "signup" })`, which creates the user without sending anything, and sets the cookie. The page re-renders with the dialog.
2. **Choose.** `chooseAccountType`:
   1. zod-validates the choice;
   2. reads the cookie (if it has expired, redirects to `/sign-in?error=choice_expired`);
   3. applies rate limits: 10/h per IP and 5/h per email;
   4. for a real `uid`: `updateUserById(app_metadata)`, then a magic link and `sendAuthEmail({ type: "activation" })`;
   5. clears the cookie and redirects to `/sign-in?notice=activation_sent`.
3. **Leave without choosing, sign in later.** `signIn` gets `email_not_confirmed`, and `account_for_email` (a service-role-only RPC) shows there is no type yet, so it sets the cookie and the dialog is back. With a type already chosen, the old "Confirm your email first" message stays.
4. **Activate.** The email link goes through `/auth/confirm` to `/dashboard` or `/employer`.

## Routing
| | Candidate | Employer |
|---|---|---|
| Home (`homeFor`) | `/dashboard` | `/employer` |
| `/dashboard`, `/saved-jobs`, `/applications` | allowed | redirected to `/employer` |
| `/employer` | redirected to `/dashboard` | allowed |
| `/`, `/jobs`, `/sign-in`, `/sign-up`, `/forgot-password` | → `/dashboard` | → `/employer` |

- Proxy does this optimistically, from the JWT.
- The real checks are `requireAccountType()` in `src/lib/auth/dal.ts`:
  - candidate pages and Server Actions (`markApplied`, `setSaved`, `setApplicationStatus`) require `"candidate"`;
  - `/employer` requires `"employer"`.
- `signIn`, `resetPassword` and `/auth/confirm` send each user to `homeFor(type)`.

## Files
- **New:**
  - `src/lib/auth/account-type.ts`, `src/lib/auth/pending-signup.ts`;
  - `src/components/auth/account-type-dialog.tsx`, `account-type-gate.tsx`;
  - `src/components/dashboard/sidebar-account.tsx` (extracted from the candidate layout);
  - `src/app/(employer)/layout.tsx`, `src/app/(employer)/employer/page.tsx`;
  - `supabase/migrations/20261025180000_account_types.sql`.
- **Changed:**
  - `src/app/(auth)/actions.ts` (`signUp`, `signIn`, `resetPassword`, new `chooseAccountType` and `startOver`);
  - `src/lib/mail.ts` (an `activation` email that replaces `signup`);
  - `src/app/auth/confirm/route.ts`, `src/lib/auth/dal.ts`, `src/lib/supabase/proxy.ts`, `src/proxy.ts`;
  - the `(auth)` layout and the sign-in form (`?notice=` and `choice_expired`);
  - `sidebar.tsx` / `sidebar-nav.tsx` (`area` prop);
  - the candidate pages and actions (`requireAccountType`);
  - `src/lib/env.ts` and `.env.example` (`AUTH_COOKIE_SECRET`).

## Setup
- **`AUTH_COOKIE_SECRET`** must be set in every environment: at least 32 characters, `openssl rand -hex 32`. It has been added to the local `.env.local`. Without it the app fails at startup with the env validation error.
- **The migration** (applied to the hosted project on 2026-10-25) backfills `account_type = candidate` and creates `public.account_for_email`. A new environment needs it too.

## Verification
**Done**, on a production build with throwaway `@example.com` users, deleted afterwards:
- **Supabase behaviour:**
  - a wrong password on an unconfirmed account gives `invalid_credentials`, the right one `email_not_confirmed`;
  - a second signup link for an unconfirmed account returns the same user and keeps its password;
  - a magic link verified as `type=email` confirms the email, and the JWT carries `account_type`.
- **The dialog:**
  - it opens after sign-up and shows the email;
  - Escape, an outside click and a reload don't close it, and it also appears on `/sign-in` while pending;
  - Continue stays disabled until a choice is made, and arrow keys move between the options;
  - "Start over" clears it.
- **The decoy:** a sign-up with a wrong password for an existing unconfirmed email opens the same dialog and ends on the same notice. The account's `app_metadata` stays unchanged and no email is sent.
- **Routing, for each type:**
  - sign-in lands on the type's home;
  - cross-side paths, `/`, `/jobs` and `/sign-up` redirect there;
  - an `/auth/confirm` link without `next` lands on the right home.
- **The employer dashboard** renders with its own sidebar and account block.

- **Sign-in to an unactivated account with no type, after the migration:**
  - a wrong password gives "Invalid email or password" and no dialog;
  - the right password opens the dialog, which survives a reload;
  - "Start over" leaves the account untouched.

**Still to do:**
- End to end with a real inbox:
  - sign up and choose "I'm hiring"; the email arrives and its link opens `/employer`;
  - the same as a job seeker, landing on `/dashboard`.
