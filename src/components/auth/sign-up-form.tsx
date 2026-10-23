"use client";

import { signUp } from "@/app/(auth)/actions";
import { FieldError, FormAlert } from "@/components/auth/form-feedback";
import { useAuthForm } from "@/components/auth/use-auth-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignUpForm() {
  const { state, formAction, pending, field } = useAuthForm(
    signUp,
    { email: "", password: "", confirmPassword: "" },
    { secrets: ["password", "confirmPassword"], linked: { password: ["confirmPassword"] } },
  );

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
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
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          {...field("password")}
          type="password"
          autoComplete="new-password"
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby="password-error"
          required
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        <FieldError id="password-error" errors={state.fieldErrors?.password} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          {...field("confirmPassword")}
          type="password"
          autoComplete="new-password"
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          aria-describedby="confirmPassword-error"
          required
        />
        <FieldError id="confirmPassword-error" errors={state.fieldErrors?.confirmPassword} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
