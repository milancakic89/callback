import type { JobListItem } from "./types";

// What the loaders below need of `fetch`, which is passed in rather than reached for: the browser
// passes its own, a test passes a stub.
export type FetchJson = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export const JOB_LIST_URL = "/api/jobs/list";
export const DESCRIPTIONS_URL = "/api/jobs/descriptions";

// The whole job list, from src/app/api/jobs/list/route.ts. Throws when it can't be had.
export async function loadJobList(fetchJson: FetchJson): Promise<JobListItem[]> {
  const response = await fetchJson(JOB_LIST_URL);
  if (!response.ok) throw new Error(`${JOB_LIST_URL}: ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body)) throw new Error(`${JOB_LIST_URL}: not a list`);
  return body as JobListItem[];
}

// Every description by list id, from src/app/api/jobs/descriptions/route.ts: 28 MB of text, which is
// why it is only asked for once a filter on the description needs it. Throws when it can't be had.
export async function loadDescriptionBundle(fetchJson: FetchJson): Promise<Record<string, string>> {
  const response = await fetchJson(DESCRIPTIONS_URL);
  if (!response.ok) throw new Error(`${DESCRIPTIONS_URL}: ${response.status}`);
  const body = await response.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(`${DESCRIPTIONS_URL}: not an object`);
  }
  return body as Record<string, string>;
}

// One job's description, for the description sheet, from src/app/api/jobs/descriptions/[jobId]/route.ts.
// Null when the job has none (the route answers 404, and the same for an id it doesn't know). Throws
// when the request itself fails, so the sheet can offer a retry instead of saying there is no text.
export async function loadDescription(fetchJson: FetchJson, listItemId: string): Promise<string | null> {
  const url = `${DESCRIPTIONS_URL}/${encodeURIComponent(listItemId)}`;
  const response = await fetchJson(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const body = await response.json();
  const description =
    typeof body === "object" && body !== null && "description" in body ? body.description : undefined;
  return typeof description === "string" && description ? description : null;
}
