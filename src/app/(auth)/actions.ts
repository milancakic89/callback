"use server";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACCOUNT_TYPES, homeFor, parseAccountType, type AccountType } from "@/lib/auth/account-type";
import { requireUser } from "@/lib/auth/dal";
import { clearPendingSignup, readPendingSignup, setPendingSignup } from "@/lib/auth/pending-signup";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { sendAuthEmail } from "@/lib/mail";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { postgresStore } from "@/lib/supabase/rate-limit-store";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TOO_MANY_ATTEMPTS = "Too many attempts. Please try again later.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

async function clientIp() {
  return getClientIp(await headers());
}

async function isLimited(key: string, limit: number, windowMs: number) {
  const { success } = await rateLimit({ key, limit, windowMs, store: postgresStore });
  return !success;
}

function fieldErrors(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }
  const { email, password } = parsed.data;

  if (await isLimited(`sign-in:${await clientIp()}:${email}`, 5, 15 * MINUTE)) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      // Supabase only says this once the password matched, so this is the account's owner. With no
      // account type yet, the activation email hasn't been sent: open the choice dialog instead.
      const account = await accountForEmail(email);
      if (account && !account.account_type) {
        await setPendingSignup({ uid: account.id, email });
        return {};
      }
      return { error: "Confirm your email first. Check your inbox for the link." };
    }
    return { error: "Invalid email or password" };
  }

  redirect(homeFor(parseAccountType(data.user.app_metadata.account_type)));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }
  const { email, password } = parsed.data;

  if (await isLimited(`sign-up:${await clientIp()}`, 3, HOUR)) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  // generateLink creates the user without sending Supabase's own email. Ours goes out only once an
  // account type is chosen (chooseAccountType), so this link's token is never used.
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
  });
  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: [error.message] } };
    }
    if (error.code !== "email_exists" && error.code !== "user_already_exists") {
      console.error("signUp generateLink failed:", error.code, error.message);
      return { error: GENERIC_ERROR };
    }
    // An active account already uses this email. The dialog still opens, as a decoy that sends
    // nothing, so sign-up doesn't reveal existing accounts.
    await setPendingSignup({ uid: null, email });
    return {};
  }

  // generateLink also succeeds for an existing, not-yet-activated account (without touching its
  // password), so only someone who knows that password gets to choose its type.
  const owner = await isUnconfirmedOwner(email, password);
  await setPendingSignup({ uid: owner ? data.user.id : null, email });
  return {};
}

const chooseAccountTypeSchema = z.object({ accountType: z.enum(ACCOUNT_TYPES) });

// The dialog's submit (features/account-types.md). Saves the type and emails the activation link,
// then lands on sign-in with a notice. The pending-signup cookie is the only authority here: there
// is no session before activation.
export async function chooseAccountType(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = chooseAccountTypeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Choose how you'll use Callback." };
  }

  const pending = await readPendingSignup();
  if (!pending) {
    await clearPendingSignup();
    redirect("/sign-in?error=choice_expired");
  }

  if (
    (await isLimited(`account-type:ip:${await clientIp()}`, 10, HOUR)) ||
    (await isLimited(`account-type:email:${pending.email}`, 5, HOUR))
  ) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  // A decoy (pending.uid null) does nothing, but ends exactly like a real choice.
  if (pending.uid) {
    const result = await activateAs(pending.uid, parsed.data.accountType);
    if (result === "failed") {
      return { error: GENERIC_ERROR };
    }
    if (result === "already_active") {
      await clearPendingSignup();
      redirect("/sign-in");
    }
  }

  await clearPendingSignup();
  redirect("/sign-in?notice=activation_sent");
}

// "Wrong email? Start over" in the dialog: drops the pending choice without sending anything. The
// unactivated account stays; signing in to it later brings the dialog back.
export async function startOver() {
  await clearPendingSignup();
  redirect("/sign-up");
}

// Saves the type and sends the activation link. The type is final once the account is active, so an
// account that got activated in the meantime keeps the one it has.
async function activateAs(uid: string, accountType: AccountType): Promise<"sent" | "already_active" | "failed"> {
  const { data: found, error: findError } = await supabaseAdmin.auth.admin.getUserById(uid);
  if (findError || !found.user?.email) {
    console.error("chooseAccountType getUserById failed:", findError?.code, findError?.message);
    return "failed";
  }
  if (found.user.email_confirmed_at) return "already_active";

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(uid, {
    app_metadata: { account_type: accountType },
  });
  if (updateError) {
    console.error("chooseAccountType updateUserById failed:", updateError.code, updateError.message);
    return "failed";
  }

  // A magic link for an unconfirmed user confirms the email when it's verified, and needs no password.
  const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: found.user.email,
  });
  if (linkError) {
    console.error("chooseAccountType generateLink failed:", linkError.code, linkError.message);
    return "failed";
  }
  try {
    await sendAuthEmail({
      to: found.user.email,
      type: "activation",
      accountType,
      tokenHash: link.properties.hashed_token,
    });
  } catch (mailError) {
    console.error("chooseAccountType email failed:", mailError);
    return "failed";
  }
  return "sent";
}

// Whether `password` belongs to this not-yet-activated account: Supabase answers email_not_confirmed
// only to the right password. A throwaway client, because a successful sign-in would leave a
// session on a shared one.
async function isUnconfirmedOwner(email: string, password: string) {
  const client = createStatelessClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error?.code === "email_not_confirmed";
}

// The account behind an email, through a secret-key-only RPC (the admin API can't search by email).
// See supabase/migrations/20261025180000_account_types.sql.
async function accountForEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .rpc("account_for_email", { p_email: email })
    .maybeSingle<{ id: string; account_type: string | null }>();
  if (error) {
    console.error("account_for_email failed:", error.code, error.message);
    return null;
  }
  return data;
}

export async function forgotPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }
  const { email } = parsed.data;

  // The IP limit stops one client from burning the project-wide email quota.
  if (
    (await isLimited(`forgot-password:ip:${await clientIp()}`, 10, HOUR)) ||
    (await isLimited(`forgot-password:email:${email}`, 3, HOUR))
  ) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email });
  if (error) {
    // Unknown email: respond identically so accounts can't be enumerated.
    if (error.code !== "user_not_found") {
      console.error("forgotPassword generateLink failed:", error.code, error.message);
    }
  } else {
    try {
      await sendAuthEmail({ to: email, type: "recovery", tokenHash: data.properties.hashed_token });
    } catch (mailError) {
      console.error("forgotPassword email failed:", mailError);
    }
  }

  return { message: "If an account exists, we've sent a reset link." };
}

export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await requireUser();

  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error) };
  }

  if (await isLimited(`reset-password:${user.id}`, 5, 15 * MINUTE)) {
    return { error: TOO_MANY_ATTEMPTS };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password" || error.code === "same_password") {
      return { fieldErrors: { password: [error.message] } };
    }
    return { error: GENERIC_ERROR };
  }

  redirect(homeFor(user.accountType));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // "/" is the landing page (features/landing.md), not a guest-only page, so proxy doesn't
  // redirect a signed-out visitor away from it.
  redirect("/");
}
