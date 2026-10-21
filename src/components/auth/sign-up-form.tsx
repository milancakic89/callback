"use client";

import { useActionState } from "react";
import { signUp } from "@/app/(auth)/actions";
import { FieldError, FormAlert, initialAuthState } from "@/components/auth/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialAuthState);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.email}
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
          name="password"
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
          name="confirmPassword"
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
