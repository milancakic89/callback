// No extra dependency: Intl.RelativeTimeFormat covers "3d ago" / "in 2 weeks" natively.
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

// `now` is required (no `Date.now()` default): a default evaluated at call time would run during
// the prerendered static shell wherever this executes without a live clock — see jobs-table.tsx.
export function formatRelative(iso: string, now: number): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  const diff = time - now;
  const abs = Math.abs(diff);
  for (const [unit, unitMs] of UNITS) {
    if (abs >= unitMs) return RELATIVE_FORMAT.format(Math.round(diff / unitMs), unit);
  }
  return "just now";
}

export function formatAbsolute(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "Unknown";
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
