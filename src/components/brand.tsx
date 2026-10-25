import { cn } from "cn";

// The app's name as shown in the UI: "Callback =>", an arrow function with `callback` as its one
// parameter (also what you hope to get after applying). Anywhere the name is plain text — page
// titles, email subjects, docs — it's just "Callback"; the arrow doesn't survive a browser tab.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-heading font-semibold tracking-tight", className)}>
      Callback <span className="text-indigo-600 dark:text-indigo-400">=&gt;</span>
    </span>
  );
}
