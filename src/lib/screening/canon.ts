import { normalizeText } from "@/lib/jobs/filter";

// The one form text is compared in: lower case, no accents, no hyphens, and every mark except the
// ones inside tech names (`c++`, `c#`, `.net`, `node.js`) a space, so "English (C1)" reads
// "english c1" and "UI/UX" reads "ui ux". Idempotent, so a filter and a CV are comparable.
export function canonText(value: string): string {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}\s+#.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
