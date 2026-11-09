import type { ScreeningFilters } from "./engine";

function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");
}

// Whether two sets of filters would give a CV the same answers: the same labels, spelled the same,
// in the same two lists. The order they are shown in changes nothing, so reordering the chips is not
// a reason to check the applications again (public.save_screening() compares the same way).
export function sameFilters(a: ScreeningFilters, b: ScreeningFilters): boolean {
  return sameMembers(a.required, b.required) && sameMembers(a.optional, b.optional);
}
