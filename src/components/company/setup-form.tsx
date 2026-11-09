"use client";

import { useActionState, useState } from "react";
import { continueToCompany, setUpCompany, type SetupFormState } from "@/app/setup/actions";
import { FieldError, FormAlert } from "@/components/auth/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPANY_NAME_MAX_LENGTH, SLUG_MAX_LENGTH, slugify } from "@/lib/companies/company";

const INITIAL_STATE: SetupFormState = {};

// The company's name and its address (features/company-slugs.md). The address follows the name
// ("Petrović d.o.o." → petrovic) until the employer types in its own field. Both inputs are
// controlled: React resets uncontrolled ones after every form action, and a refused address
// shouldn't wipe what was typed.
export function SetupForm() {
  const [state, formAction, pending] = useActionState(setUpCompany, INITIAL_STATE);
  const [name, setName] = useState("");
  // Null while the address follows the name.
  const [typedSlug, setTypedSlug] = useState<string | null>(null);
  const slug = typedSlug ?? slugify(name);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <div className="grid gap-2">
        <Label htmlFor="name">Company name</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="organization"
          placeholder="Acme d.o.o."
          maxLength={COMPANY_NAME_MAX_LENGTH}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby="name-error"
          autoFocus
          required
        />
        <FieldError id="name-error" errors={state.fieldErrors?.name} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="slug">Company address</Label>
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-muted-foreground">
            /
          </span>
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={(event) => setTypedSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="acme"
            maxLength={SLUG_MAX_LENGTH}
            aria-invalid={Boolean(state.fieldErrors?.slug)}
            aria-describedby="slug-hint slug-error"
            required
          />
        </div>
        <FieldError id="slug-error" errors={state.fieldErrors?.slug} />
        <p id="slug-hint" className="text-sm text-muted-foreground">
          Your workspace lives at this address. You can&apos;t change it later, because links to it would
          break.
        </p>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Create company"}
      </Button>
    </form>
  );
}

// For a company that has its address while this session doesn't know it (the sign-in on another
// device, or a refresh that failed): nothing to type, only the session to update.
export function ContinueForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState(continueToCompany, INITIAL_STATE);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <Button type="submit" size="lg" className="w-full" disabled={pending} autoFocus>
        {pending ? "Opening…" : `Continue to ${name}`}
      </Button>
    </form>
  );
}
