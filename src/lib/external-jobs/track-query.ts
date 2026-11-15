import { z } from "zod";
import { canonicalJobUrl, type CanonicalJob } from "./canonical-url";
import type { ExternalSource } from "./sources";
import {
  buildTrackPath,
  capText,
  cleanLinkText,
  COMPANY_MAX,
  LOCATION_MAX,
  TITLE_MAX,
  TRACK_PARAMS,
  TRACK_PATH,
} from "./track-link";

// The server's side of the extension's link (features/chrome-extension.md): everything in the address of
// /applications/new is read as untrusted. The job's address must be one of the three sites' and is
// reduced to its canonical form, and the source comes from its host, never from a parameter. Opening
// the page writes nothing: the candidate still has to press Save.

export type TrackQuery = {
  source: ExternalSource;
  url: string;
  title: string | null;
  company: string | null;
  location: string | null;
};

export const INVALID_JOB_LINK_MESSAGE = "That link doesn't point to a job we can add.";

// The address of the job: one of the three sites', as its canonical form.
export const jobUrlSchema = z.string().transform((value, context): CanonicalJob => {
    const canonical = canonicalJobUrl(value);
    if (!canonical) {
      context.addIssue({ code: "custom", message: INVALID_JOB_LINK_MESSAGE });
      return z.NEVER;
    }
    return canonical;
  });

// A prefilled field: cleaned and cut to its length. Missing or empty is null, so the form asks for it.
const prefilledText = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) => capText(cleanLinkText(value ?? ""), max) || null);

const trackQuerySchema = z.object({
  url: jobUrlSchema,
  title: prefilledText(TITLE_MAX),
  company: prefilledText(COMPANY_MAX),
  location: prefilledText(LOCATION_MAX),
});

// What a page receives as `searchParams`, or a URLSearchParams.
export type TrackSearchParams = URLSearchParams | Record<string, string | string[] | undefined>;

// One value per known parameter. A parameter given twice is ambiguous, so it is refused outright
// rather than guessing which one counts.
function singleValues(searchParams: TrackSearchParams): Record<string, string> | null {
  const entries: [string, string | string[] | undefined][] =
    searchParams instanceof URLSearchParams
      ? [...new Set(searchParams.keys())].map((key): [string, string[]] => [key, searchParams.getAll(key)])
      : Object.entries(searchParams);

  const values: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!(TRACK_PARAMS as readonly string[]).includes(key) || value === undefined) continue;
    const only = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value;
    if (only === null) return null;
    values[key] = only;
  }
  return values;
}

export type TrackQueryResult = { ok: true; value: TrackQuery } | { ok: false };

// The job the address names, or `{ ok: false }` when it names none we can add. Other parameters (a
// campaign tag) are ignored here; trackNext() is the one that refuses them.
export function parseTrackQuery(searchParams: TrackSearchParams): TrackQueryResult {
  const values = singleValues(searchParams);
  if (!values) return { ok: false };
  const parsed = trackQuerySchema.safeParse(values);
  if (!parsed.success) return { ok: false };
  const { url, title, company, location } = parsed.data;
  return { ok: true, value: { source: url.source, url: url.url, title, company, location } };
}

const NEXT_MAX = 4000;

// A sign-in's `next` that is the link of this page and nothing else: the exact path, the known
// parameters only (each once), no fragment. The path comes back rebuilt from what was parsed, so what
// is followed afterwards is always a link this code made.
export function trackNext(next: unknown): string | null {
  if (typeof next !== "string" || next.length > NEXT_MAX || !next.startsWith(`${TRACK_PATH}?`)) return null;

  const query = new URLSearchParams(next.slice(TRACK_PATH.length + 1));
  if (next.includes("#")) return null;
  for (const key of query.keys()) {
    if (!(TRACK_PARAMS as readonly string[]).includes(key)) return null;
  }
  const parsed = parseTrackQuery(query);
  return parsed.ok ? buildTrackPath(parsed.value) : null;
}
