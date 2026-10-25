"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/app/(auth)/actions";
import { FieldError, FormAlert } from "@/components/auth/form-feedback";
import { useAuthForm } from "@/components/auth/use-auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LINK_ERRORS: Record<string, string> = {
  invalid_link: "That link is invalid or has expired. Please request a new one.",
  choice_expired: "That step expired. Sign in again to choose how you'll use Callback.",
};

// Set by chooseAccountType once the activation email is on its way (features/account-types.md).
const NOTICES: Record<string, string> = {
  activation_sent: "We've sent your activation link. Check your email to activate your account.",
};

export function SignInForm() {
  const { state, formAction, pending, field } = useAuthForm(
    signIn,
    { email: "", password: "" },
    { secrets: ["password"] },
  );
  const searchParams = useSearchParams();
  const linkError = LINK_ERRORS[searchParams.get("error") ?? ""];
  const notice = NOTICES[searchParams.get("notice") ?? ""];
  const alertState =
    state.error || state.message
      ? state
      : linkError
        ? { error: linkError }
        : notice
          ? { message: notice }
          : state;

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={alertState} />
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          {...field("email")}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby="email-error"
          required
        />
        <FieldError id="email-error" errors={state.fieldErrors?.email} />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          {...field("password")}
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby="password-error"
          required
        />
        <FieldError id="password-error" errors={state.fieldErrors?.password} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
