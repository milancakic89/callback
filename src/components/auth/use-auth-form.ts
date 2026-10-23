"use client";

import { useActionState, useState } from "react";
import type { AuthFormState } from "@/app/(auth)/actions";
import { initialAuthState } from "@/components/auth/form-feedback";

type Options<Field extends string> = {
  /** Password inputs. Cleared after a response that doesn't point at a specific field. */
  secrets?: Field[];
  /** Fields that go stale when the key is wrong, e.g. confirmPassword once password changes. */
  linked?: Partial<Record<Field, Field[]>>;
};

/**
 * React resets uncontrolled inputs after every form action, so a failed submit would wipe the
 * whole form. Keeping the values in state makes that reset a no-op and lets us clear only the
 * fields the server flagged.
 */
export function useAuthForm<Values extends Record<string, string>>(
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>,
  initialValues: Values,
  { secrets = [], linked = {} }: Options<keyof Values & string> = {},
) {
  type Field = keyof Values & string;
  const [state, formAction, pending] = useActionState(action, initialAuthState);
  const [values, setValues] = useState(initialValues);
  const [handled, setHandled] = useState(state);

  // Runs once per server response, during render, so the cleared values show up in the same paint.
  if (handled !== state) {
    setHandled(state);
    const wrong = (Object.keys(state.fieldErrors ?? {}) as Field[]).filter(
      (field) => state.fieldErrors?.[field]?.length,
    );
    const stale = new Set<Field>(wrong.flatMap((field) => [field, ...(linked[field] ?? [])]));
    if (!wrong.length) secrets.forEach((field) => stale.add(field));
    if (stale.size) {
      setValues((current) => {
        const next = { ...current };
        stale.forEach((field) => ((next[field] as string) = ""));
        return next;
      });
    }
  }

  const field = (name: Field) => ({
    name,
    value: values[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((current) => ({ ...current, [name]: event.target.value })),
  });

  return { state, formAction, pending, field };
}
