"use client";

import { useActionState } from "react";
import { resetPassword } from "@/app/(auth)/actions";
import { FieldError, FormAlert, initialAuthState } from "@/components/auth/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPassword, initialAuthState);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-2">
        <Label htmlFor="password">New password</Label>
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
        <Label htmlFor="confirmPassword">Confirm new password</Label>
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
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
