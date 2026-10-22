"use client";

import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

type JobsSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

// Live, no debounce — see features/dashboard.md "Search is live with no debounce."
export function JobsSearch({ value, onChange }: JobsSearchProps) {
  return (
    <div className="relative w-full">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search title or company…"
        className="h-9 pl-8"
        aria-label="Search jobs"
      />
    </div>
  );
}
