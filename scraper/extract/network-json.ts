import { absoluteUrl, cleanText, plain, shortHash } from "../text";
import type { RawJob } from "../types";
import { htmlToText } from "./description";
import { asArray, asRecord, asString, firstString } from "./json";
import { extractLinks } from "./links";
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
  "jobLocation",
  "job_location",
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

// True when `token` stands alone in `text`: "/5788-senior-dev" contains "5788", "/15788-dev" doesn't.
function hasToken(text: string, token: string): boolean {
  const alnum = /[a-z0-9]/;
  for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + 1)) {
    if (!alnum.test(text[at - 1] ?? "") && !alnum.test(text[at + token.length] ?? "")) return true;
  }
  return false;
}

// Some job APIs send no link, but the page has one. Two different links count as none.
function jobLinkFinder(html: string, pageUrl: string) {
  let links: { url: string; path: string; text: string }[] | null = null;
  const pageLinks = () =>
    (links ??= (html ? extractLinks(html, pageUrl) : []).map((link) => {
      const { pathname, search } = new URL(link.url);
      return { url: link.url, path: `${pathname}${search}`.toLowerCase(), text: plain(link.text) };
    }));
  const unique = (matches: { url: string }[]) => {
    const urls = new Set(matches.map((link) => link.url));
    return urls.size === 1 ? [...urls][0] : null;
  };
  return {
    // The href holds the job's id: /usemultiplier/5788-senior-engineer.
    byId(id: string | null): string | null {
      // Short ids ("12") turn up in unrelated paths.
      if (!id || id.length < 4) return null;
      return unique(pageLinks().filter((link) => hasToken(link.path, id.toLowerCase())));
    },
    // The link text is the title. Menus and blog teasers have those too, so this only fills in a
    // link for a list that is already known to be jobs; it is no evidence by itself.
    byTitle(title: string): string | null {
      const wanted = plain(title);
      const exact = pageLinks().filter((link) => link.text === wanted);
      return unique(exact.length ? exact : pageLinks().filter((link) => link.text.includes(wanted)));
    },
  };
}

// Many custom careers pages load their list from their own API; find the array that is the job list.
export function extractNetworkJobs(captured: CapturedJson[], pageUrl: string, html = ""): RawJob[] {
  const pageLink = jobLinkFinder(html, pageUrl);
  let best: { records: Records; key: string; matches: number } | null = null;
  for (const response of captured) {
    const arrays: Records[] = [];
    collectArrays(response.body, 0, arrays);
    for (const records of arrays) {
      const title = titleKeyOf(records);
      if (!title || title.matches < Math.max(1, records.length * 0.5)) continue;
      // An id alone proves little: department lists, blog posts and testimonials have one too. A
      // posting names a place or has a link, in the JSON or on the page.
      const detailKeys = [...LOCATION_KEYS, ...URL_KEYS];
      const withDetails = records.filter(
        (record) => detailKeys.some((key) => record[key] != null) || pageLink.byId(firstString(record, ID_KEYS)),
      );
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
    const listedUrl = rawUrl ? absoluteUrl(rawUrl, rawUrl.startsWith("/") ? pageUrl : base) : null;
    const id = firstString(record, ID_KEYS);
    // Made from the list alone, so a link found on the page later never changes a job's id.
    const externalId = id ?? shortHash(listedUrl ?? title);
    jobs.set(externalId, {
      externalId,
      title,
      url: listedUrl ?? pageLink.byId(id) ?? pageLink.byTitle(title),
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
