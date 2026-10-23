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
  if (!(await robotsAllowed(url))) {
    return { status: 0, url, html: "", usable: false, blocked: true, error: "blocked by robots.txt" };
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

type RobotsRule = { allow: boolean; pattern: RegExp; length: number };

const robotsCache = new Map<string, Promise<RobotsRule[]>>();

export async function robotsAllowed(url: string): Promise<boolean> {
  const { origin, pathname, search } = new URL(url);
  let rules = robotsCache.get(origin);
  if (!rules) {
    rules = loadRobots(origin);
    robotsCache.set(origin, rules);
  }
  const target = pathname + search;
  let best: RobotsRule | null = null;
  for (const rule of await rules) {
    if (!rule.pattern.test(target)) continue;
    if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule;
  }
  return best?.allow ?? true;
}

async function loadRobots(origin: string): Promise<RobotsRule[]> {
  try {
    const res = await request(`${origin}/robots.txt`, { timeoutMs: 8000, retries: 0 });
    return res.status < 400 ? parseRobots(res.text) : [];
  } catch {
    return [];
  }
}

// Only the "*" group applies to us; longest matching rule wins, as in RFC 9309.
export function parseRobots(text: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
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
    if ((key === "allow" || key === "disallow") && value && agents.includes("*")) {
      rules.push({ allow: key === "allow", pattern: robotsPattern(value), length: value.length });
    }
  }
  return rules;
}

function robotsPattern(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}
