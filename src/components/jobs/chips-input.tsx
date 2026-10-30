"use client";

import { useState, type KeyboardEvent } from "react";
import { XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type ChipsInputProps = {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  maxValues?: number;
  maxLength?: number;
  // For the inner <input>, so a <Label htmlFor> and a field error can point at it.
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

// Enter or comma adds the current text as a value (a chip); Backspace in an empty box removes the
// last one. See features/dashboard.md "Text values are chips."
export function ChipsInput({
  values,
  onChange,
  placeholder,
  maxValues = 20,
  maxLength = 100,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: ChipsInputProps) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const value = raw.trim().slice(0, maxLength);
    setDraft("");
    if (!value || values.length >= maxValues || values.includes(value)) return;
    onChange([...values, value]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(draft);
    } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div
      className="flex min-h-8 min-w-48 flex-1 flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-3 has-[input[aria-invalid=true]]:ring-destructive/20 dark:has-[input[aria-invalid=true]]:border-destructive/50 dark:has-[input[aria-invalid=true]]:ring-destructive/40"
    >
      {values.map((value) => (
        <Badge key={value} variant="secondary" className="h-6 gap-1 rounded-md pr-1">
          {value}
          <button
            type="button"
            onClick={() => onChange(values.filter((v) => v !== value))}
            className="rounded-full p-0.5 hover:bg-foreground/10"
            aria-label={`Remove ${value}`}
          >
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commit(draft)}
        placeholder={values.length === 0 ? placeholder : undefined}
        className="h-6 min-w-28 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
