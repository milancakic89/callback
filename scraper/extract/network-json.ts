import { absoluteUrl, cleanText, shortHash } from "../text";
import type { RawJob } from "../types";
import { htmlToText } from "./description";
import { asArray, asRecord, asString, firstString } from "./json";
import { looksLikeJobTitle } from "./titles";

export type CapturedJson = { url: string; body: unknown };

type Records = Record<string, unknown>[];

const TITLE_KEYS = [
  "title",
  "jobTitle",
  "job_title",
  "positionName",
  "position_name",
  "position",
  "name",
  "text",
  "jobName",
  "naziv",
];
const LOCATION_KEYS = [
  "location",
  "locations",
  "locationName",
  "location_name",
  "city",
  "cities",
  "office",
  "offices",
  "workplace",
  "country",
  "lokacija",
  "grad",
];
const URL_KEYS = [
  "url",
  "absolute_url",
  "absoluteUrl",
  "hostedUrl",
  "jobUrl",
  "job_url",
  "applyUrl",
  "apply_url",
  "link",
  "href",
  "careers_url",
  "permalink",
  "slug",
];
const ID_KEYS = ["id", "uuid", "shortcode", "jobId", "job_id", "reference", "requisitionId", "code"];
const DATE_KEYS = ["datePosted", "publishedAt", "published_at", "postedAt", "createdAt", "created_at"];
const DESCRIPTION_KEYS = [
  "description",
  "descriptionHtml",
  "jobDescription",
  "content",
  "body",
  "html",
  "excerpt",
];

// List APIs often wrap each item: [{ data: { title, ... } }, ...].
const WRAPPER_KEYS = ["data", "node", "attributes", "item", "job", "fields", "_source"];

function collectArrays(node: unknown, depth: number, out: Records[]): void {
  if (depth > 6) return;
  if (Array.isArray(node)) {
    const records = node.map(asRecord).filter((record) => record !== null);
    if (records.length && records.length === node.length) {
      out.push(records);
      for (const key of WRAPPER_KEYS) {
        const inner = records.map((record) => asRecord(record[key])).filter((r) => r !== null);
        if (inner.length === records.length) {
          out.push(inner);
          break;
        }
      }
    }
    for (const item of node.slice(0, 50)) collectArrays(item, depth + 1, out);
    return;
  }
  const record = asRecord(node);
  if (record) for (const value of Object.values(record)) collectArrays(value, depth + 1, out);
}

function titleKeyOf(records: Records): { key: string; matches: number } | null {
  let best: { key: string; matches: number } | null = null;
  for (const key of TITLE_KEYS) {
    const matches = records.filter((record) => looksLikeJobTitle(asString(record[key]))).length;
    if (matches && (!best || matches > best.matches)) best = { key, matches };
  }
  return best;
}

function locationText(value: unknown): string | null {
  const parts = asArray(value)
    .map((item) => {
      const text = asString(item);
      if (text) return text;
      const record = asRecord(item);
      if (!record) return null;
      const country = asString(record.country) ?? asString(asRecord(record.country)?.name);
      return [firstString(record, ["name", "title", "label", "city", "town"]), country].filter(Boolean).join(", ");
    })
    .filter((part): part is string => Boolean(part));
  return parts.length ? [...new Set(parts)].join(" / ") : null;
}

// Many custom careers pages load their list from their own API; find the array that is the job list.
export function extractNetworkJobs(captured: CapturedJson[], pageUrl: string): RawJob[] {
  let best: { records: Records; key: string; matches: number } | null = null;
  for (const response of captured) {
    const arrays: Records[] = [];
    collectArrays(response.body, 0, arrays);
    for (const records of arrays) {
      const title = titleKeyOf(records);
      if (!title || title.matches < Math.max(1, records.length * 0.5)) continue;
      const detailKeys = [...LOCATION_KEYS, ...URL_KEYS, ...ID_KEYS];
      const withDetails = records.filter((record) => detailKeys.some((key) => record[key] != null));
      if (withDetails.length < records.length * 0.5) continue;
      if (!best || title.matches > best.matches) best = { records, ...title };
    }
  }
  if (!best) return [];
  const { records, key } = best;

  // A bare slug resolves under the careers page: "senior-dev" → /careers/senior-dev.
  const base = pageUrl.endsWith("/") ? pageUrl : `${pageUrl}/`;
  const jobs = new Map<string, RawJob>();
  for (const record of records) {
    const title = cleanText(asString(record[key]));
    if (!looksLikeJobTitle(title)) continue;
    const rawUrl = firstString(record, URL_KEYS);
    const url = rawUrl ? absoluteUrl(rawUrl, rawUrl.startsWith("/") ? pageUrl : base) : null;
    const externalId = firstString(record, ID_KEYS) ?? shortHash(url ?? title);
    jobs.set(externalId, {
      externalId,
      title,
      url,
      location: LOCATION_KEYS.map((k) => locationText(record[k])).find(Boolean) ?? null,
      countryCode: null,
      remote: typeof record.remote === "boolean" ? record.remote : null,
      department: firstString(record, ["department", "team", "category"]),
      postedAt: firstString(record, DATE_KEYS),
      description: htmlToText(firstString(record, DESCRIPTION_KEYS)),
    });
  }
  return [...jobs.values()];
}
