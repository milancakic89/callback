"use client";

import { BriefcaseBusinessIcon, SearchIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { chooseAccountType, startOver } from "@/app/(auth)/actions";
import { FormAlert, initialAuthState } from "@/components/auth/form-feedback";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AccountType } from "@/lib/auth/account-type";
import { cn } from "cn";

const OPTIONS: { type: AccountType; title: string; body: string; icon: typeof SearchIcon }[] = [
  {
    type: "candidate",
    title: "I'm looking for a job",
    body: "Browse open roles, save the ones you like and track every application.",
    icon: SearchIcon,
  },
  {
    type: "employer",
    title: "I'm hiring",
    body: "Post jobs and review candidates for your company.",
    icon: BriefcaseBusinessIcon,
  },
];

// Shown by AccountTypeGate while a pending-signup cookie exists (features/account-types.md). There is
// no way to dismiss it: `open` is fixed and close requests (Escape, outside click) are ignored, so the
// activation email only goes out once a type is chosen. "Start over" is for a mistyped email; it
// abandons this sign-up rather than skipping the choice. The popup is portalled out of the dark auth
// layout, so it carries its own `dark` class.
export function AccountTypeDialog({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(chooseAccountType, initialAuthState);
  const [choice, setChoice] = useState<AccountType | null>(null);

  return (
    <AlertDialog open onOpenChange={() => {}}>
      <AlertDialogContent className="dark gap-5 p-6 data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">How will you use Callback?</AlertDialogTitle>
          <AlertDialogDescription>Choose one to finish creating your account.</AlertDialogDescription>
        </AlertDialogHeader>

        <form action={formAction} className="grid gap-4">
          <FormAlert state={state} />
          <fieldset className="grid gap-3">
            <legend className="sr-only">Account type</legend>
            {OPTIONS.map(({ type, title, body, icon: Icon }) => (
              <label
                key={type}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted/60",
                  "has-checked:border-primary has-checked:bg-primary/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                )}
              >
                <input
                  type="radio"
                  name="accountType"
                  value={type}
                  checked={choice === type}
                  onChange={() => setChoice(type)}
                  className="sr-only"
                  required
                />
                <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", choice === type ? "text-primary" : "text-muted-foreground")} />
                <span className="grid gap-1">
                  <span className="font-medium">{title}</span>
                  <span className="text-sm text-muted-foreground">{body}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-sm text-muted-foreground">
            We&rsquo;ll email your activation link to <span className="font-medium text-foreground">{email}</span> once
            you choose. This can&rsquo;t be changed after activation.
          </p>
          <Button type="submit" size="lg" className="h-11 text-base" disabled={!choice || pending}>
            {pending ? "Sending activation link…" : "Continue"}
          </Button>
        </form>

        <form action={startOver} className="text-center">
          <button
            type="submit"
            className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Wrong email? Start over
          </button>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
