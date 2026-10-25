"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirm your email first. Check your inbox for the link." };
    }
    return { error: "Invalid email or password" };
  }

  redirect("/dashboard");
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

  // generateLink creates the user without sending Supabase's own email; we send it via SMTP.
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
  });
  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: [error.message] } };
    }
    // Don't reveal existing accounts.
    if (error.code !== "email_exists" && error.code !== "user_already_exists") {
      console.error("signUp generateLink failed:", error.code, error.message);
      return { error: GENERIC_ERROR };
    }
  } else {
    try {
      await sendAuthEmail({ to: email, type: "signup", tokenHash: data.properties.hashed_token });
    } catch (mailError) {
      console.error("signUp email failed:", mailError);
      return { error: GENERIC_ERROR };
    }
  }

  return { message: "Check your email to confirm your account." };
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

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // "/" is the landing page (features/landing.md), not a guest-only page, so proxy doesn't
  // redirect a signed-out visitor away from it.
  redirect("/");
}
