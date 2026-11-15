import { EXTERNAL_SOURCE_HOSTS, externalSourceOfHost, parseHttpsUrl, type ExternalSource } from "./sources";

// The one address a job has on its site (features/chrome-extension.md): https, no query, no hash, no
// credentials, and the site's own shape. It is the key a job is tracked by, so the same job reached
// from a search result, a shared link or the page itself is one row. Plain module: the server and the
// browser extension both use it, and nothing in an address is trusted before it has been through here.

export type CanonicalJob = { source: ExternalSource; url: string };

// The longest address kept; supabase/migrations/*_external_applications.sql checks the same.
export const JOB_URL_MAX = 500;
const INPUT_MAX = 2000;

// The shape of each site's canonical address, as the source of a regular expression that means the same
// in JavaScript and in Postgres (`~`): the migration's check constraints are these strings, and a test
// holds the two together.
export const CANONICAL_URL_PATTERNS: Record<ExternalSource, string> = {
  linkedin: "^https://www\\.linkedin\\.com/jobs/view/[0-9]{5,20}/$",
  helloworld: "^https://www\\.helloworld\\.rs/posao/[^/?#]+/[^/?#]+/[0-9]{1,12}$",
  infostud: "^https://poslovi\\.infostud\\.com/posao/[^/?#]+/[^/?#]+/[0-9]{1,12}$",
};

// /jobs/view/4001234567/ and the slug form, /jobs/view/software-engineer-at-acme-4001234567.
const LINKEDIN_VIEW_ID = /^(?:[^/]*-)?([0-9]{5,20})$/;
const LINKEDIN_JOB_ID = /^[0-9]{5,20}$/;
const NUMERIC_ID = /^[0-9]{1,12}$/;

// The path's segments, without the leading slash and without one trailing slash. An empty segment
// anywhere else ("//") stays, and so fails the checks below.
function pathSegments(pathname: string): string[] {
  const segments = pathname.split("/").slice(1);
  if (segments.at(-1) === "") segments.pop();
  return segments;
}

function linkedinJobUrl(url: URL): string | null {
  const segments = pathSegments(url.pathname);
  if (segments[0] !== "jobs") return null;

  let jobId: string | null = null;
  if (segments[1] === "view" && segments.length === 3) {
    jobId = LINKEDIN_VIEW_ID.exec(segments[2])?.[1] ?? null;
  } else {
    // A job opened in the search or the recommendations: /jobs/search/?currentJobId=4001234567.
    const currentJobId = url.searchParams.get("currentJobId");
    jobId = currentJobId && LINKEDIN_JOB_ID.test(currentJobId) ? currentJobId : null;
  }
  return jobId ? `https://${EXTERNAL_SOURCE_HOSTS.linkedin}/jobs/view/${jobId}/` : null;
}

// HelloWorld and Infostud both use /posao/{title}/{company}/{id}.
function boardJobUrl(url: URL, source: "helloworld" | "infostud"): string | null {
  const segments = pathSegments(url.pathname);
  if (segments.length !== 4 || segments[0] !== "posao" || !NUMERIC_ID.test(segments[3])) return null;
  const [, title, company, jobId] = segments;
  return `https://${EXTERNAL_SOURCE_HOSTS[source]}/posao/${title}/${company}/${jobId}`;
}

export function canonicalJobUrl(input: string): CanonicalJob | null {
  if (typeof input !== "string" || input.length === 0 || input.length > INPUT_MAX) return null;
  const url = parseHttpsUrl(input.trim());
  if (!url) return null;
  const source = externalSourceOfHost(url.hostname);
  if (!source) return null;

  const canonical = source === "linkedin" ? linkedinJobUrl(url) : boardJobUrl(url, source);
  if (!canonical || canonical.length > JOB_URL_MAX) return null;
  // The same test the database applies, so nothing built here is refused there.
  if (!new RegExp(CANONICAL_URL_PATTERNS[source]).test(canonical)) return null;
  return { source, url: canonical };
}
