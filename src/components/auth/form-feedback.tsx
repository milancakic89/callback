import { CircleCheckIcon } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AuthFormState } from "@/app/(auth)/actions";

export const initialAuthState: AuthFormState = {};

export function FormAlert({ state }: { state: AuthFormState }) {
  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  // The auth pages are dark, so a message (activation sent, reset link sent) can be lime text.
  if (state.message) {
    return (
      <Alert variant="success">
        <CircleCheckIcon aria-hidden />
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  return null;
}

export function FieldError({ id, errors, className }: { id: string; errors?: string[]; className?: string }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className={cn("text-sm text-destructive", className)}>
      {errors[0]}
    </p>
  );
}
