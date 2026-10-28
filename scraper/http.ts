import { sleep } from "./pool";
import { describeError } from "./text";

export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Company websites get 1 req/s; public ATS APIs are built for programmatic access.
export const SITE_INTERVAL_MS = 1000;
export const API_INTERVAL_MS = 250;

const MAX_HTML_CHARS = 5_000_000;

export type RequestOptions = {
  method?: "GET" | "POST";
  json?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  intervalMs?: number;
  retries?: number;
};

export type HttpResponse = { status: number; url: string; text: string; contentType: string };

const nextSlot = new Map<string, number>();

// Honored only when short: Workable has answered a burst with a ~23-hour Retry-After.
const MAX_RETRY_AFTER_MS = 60_000;

function retryAfterMs(res: Response): number | null {
  const seconds = Number(res.headers.get("retry-after"));
  return seconds > 0 && seconds * 1000 <= MAX_RETRY_AFTER_MS ? seconds * 1000 : null;
}

async function throttle(host: string, intervalMs: number): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + intervalMs);
  if (slot > now) await sleep(slot - now);
}

export async function request(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
  const {
    method = "GET",
    json,
    headers = {},
    timeoutMs = 20_000,
    intervalMs = SITE_INTERVAL_MS,
    retries = 1,
  } = options;
  const host = new URL(url).host;

  for (let attempt = 0; ; attempt++) {
    await throttle(host, intervalMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9,sr;q=0.8",
          ...(json === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        body: json === undefined ? undefined : JSON.stringify(json),
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(retryAfterMs(res) ?? 2000 * (attempt + 1));
        continue;
      }
      return {
        status: res.status,
        url: res.url || url,
        text: await res.text(),
        contentType: res.headers.get("content-type") ?? "",
      };
    } catch (error) {
      if (attempt >= retries) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}

export async function getJson(
  url: string,
  options: RequestOptions = {},
): Promise<{ status: number; data: unknown }> {
  const res = await request(url, {
    intervalMs: API_INTERVAL_MS,
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  try {
    return { status: res.status, data: JSON.parse(res.text) };
  } catch {
    return { status: res.status, data: null };
  }
}

export type HtmlPage = {
  status: number;
  url: string;
  html: string;
  // Enough HTML to analyze; otherwise the caller may fall back to a browser.
  usable: boolean;
  blocked: boolean;
  error: string | null;
};

export async function fetchHtml(url: string): Promise<HtmlPage> {
  const policy = await crawlPolicy(url);
  if (!policy.allowed) {
    return { status: 0, url, html: "", usable: false, blocked: true, error: policy.error };
  }
  try {
    // No retry: a dead company website would otherwise cost two full timeouts.
    const res = await request(url, { timeoutMs: 15_000, retries: 0 });
    const isHtml = !res.contentType || /html|xml/i.test(res.contentType);
    const html = isHtml ? res.text.slice(0, MAX_HTML_CHARS) : "";
    const usable = res.status < 400 && html.length >= 2048;
    return {
      status: res.status,
      url: res.url,
      html,
      usable,
      blocked: false,
      error: usable ? null : `HTTP ${res.status}, ${html.length} bytes of HTML`,
    };
  } catch (error) {
    return { status: 0, url, html: "", usable: false, blocked: false, error: describeError(error) };
  }
}

// ——— robots.txt: which sites the scraper goes through ———
//
// Where the scraper walks a company's own pages to find its jobs (the homepage and careers search,
// the careers page, a job's page, anything it opens in the browser), it does so only on a site whose
// robots.txt forbids nothing to us. Any non-empty `Disallow` for `*` is enough to leave the site
// alone, even for a path we never needed (`/wp-admin/`): the aim is a position that can be stated
// without exceptions. A site we couldn't read the file of (403, a failing server) hasn't told us what
// it allows, so it is left alone too. No file at all (404) is no rules, as in RFC 9309.
//
// The public APIs of ATS vendors and job boards, and Joberty's, are not walked pages and don't come
// through here: they use `getJson`/`request` directly.
export const ROBOTS_DISALLOWED = "blocked by robots.txt";
export const ROBOTS_UNREADABLE = "robots.txt not readable";

// A refusal for a site that said so, as opposed to one we couldn't ask. The first is final: its jobs
// are closed (stages/finalize.ts). The second may be a bad minute, so they are left as they were.
export const isRobotsDisallowed = (error: string | null | undefined): boolean => Boolean(error?.includes(ROBOTS_DISALLOWED));
export const isRobotsRefusal = (error: string | null | undefined): boolean =>
  isRobotsDisallowed(error) || Boolean(error?.includes(ROBOTS_UNREADABLE));

export type CrawlPolicy = { allowed: true; error: null } | { allowed: false; error: string };

const policyCache = new Map<string, Promise<CrawlPolicy>>();

// One answer per site (origin) per run.
export function crawlPolicy(url: string): Promise<CrawlPolicy> {
  const { origin } = new URL(url);
  let policy = policyCache.get(origin);
  if (!policy) {
    policy = loadPolicy(origin);
    policyCache.set(origin, policy);
  }
  return policy;
}

export async function robotsAllowed(url: string): Promise<boolean> {
  return (await crawlPolicy(url)).allowed;
}

async function loadPolicy(origin: string): Promise<CrawlPolicy> {
  let res: HttpResponse;
  try {
    res = await request(`${origin}/robots.txt`, { timeoutMs: 8000, retries: 0 });
  } catch (error) {
    return { allowed: false, error: `${ROBOTS_UNREADABLE}: ${describeError(error)}` };
  }
  // 401 and 403 aren't "no file": the site turned us away from it, and 429 asks us to slow down. A
  // 5xx is a server that may be failing, and RFC 9309 says to assume nothing is allowed then.
  if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
    return { allowed: false, error: `${ROBOTS_UNREADABLE}: HTTP ${res.status}` };
  }
  if (res.status >= 400) return { allowed: true, error: null };
  // A single-page app answers every path, /robots.txt included, with its HTML.
  if (/html/i.test(res.contentType) && /<(!doctype|html)/i.test(res.text.slice(0, 500))) {
    return { allowed: true, error: null };
  }
  const disallowed = disallowedPaths(res.text);
  if (!disallowed.length) return { allowed: true, error: null };
  const shown = disallowed.slice(0, 3).join(" ");
  return { allowed: false, error: `${ROBOTS_DISALLOWED}: Disallow ${shown}${disallowed.length > 3 ? " …" : ""}` };
}

// The non-empty `Disallow` values of the "*" group, which is the only group that applies to us. A
// group for a named bot (GPTBot, CCBot…) says nothing about us, and an empty `Disallow:` allows all.
export function disallowedPaths(text: string): string[] {
  const paths: string[] = [];
  let agents: string[] = [];
  let readingAgents = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const match = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(rawLine.replace(/#.*/, ""));
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2];
    if (key === "user-agent") {
      if (!readingAgents) agents = [];
      agents.push(value.toLowerCase());
      readingAgents = true;
      continue;
    }
    readingAgents = false;
    if (key === "disallow" && value && agents.includes("*")) paths.push(value);
  }
  return paths;
}
