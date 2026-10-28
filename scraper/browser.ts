import { chromium, type Browser, type Page } from "playwright";
import type { CapturedJson } from "./extract/network-json";
import { crawlPolicy, USER_AGENT } from "./http";

const MAX_PAGES = 4;
const MAX_JSON_BYTES = 3_000_000;

let browser: Promise<Browser> | null = null;
let openPages = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (openPages < MAX_PAGES) {
    openPages++;
    return;
  }
  // release() hands its slot straight to us, so openPages stays the same.
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else openPages--;
}

export type PageCapture = { requests: string[]; json: CapturedJson[] };

// Waits for client-side rendering: network idle, then a scroll for lazy-loaded lists.
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(1000);
}

export async function withPage<T>(
  url: string,
  fn: (page: Page, capture: PageCapture) => Promise<T>,
): Promise<T> {
  // Every page the browser opens goes through here, so the robots.txt policy (http.ts) is kept in
  // one place. The requests a page then makes itself, to its own backend or to a public API (the
  // `network` source reads those), are the page's and are not checked one by one.
  const policy = await crawlPolicy(url);
  if (!policy.allowed) throw new Error(policy.error);
  await acquire();
  try {
    browser ??= chromium.launch({ headless: true });
    const context = await (await browser).newContext({
      userAgent: USER_AGENT,
      locale: "en-US",
      viewport: { width: 1366, height: 900 },
    });
    try {
      const page = await context.newPage();
      const capture: PageCapture = { requests: [], json: [] };
      await page.route("**/*", (route) =>
        ["image", "media", "font"].includes(route.request().resourceType())
          ? route.abort()
          : route.continue(),
      );
      page.on("request", (req) => capture.requests.push(req.url()));
      page.on("response", async (res) => {
        const type = res.headers()["content-type"] ?? "";
        const size = Number(res.headers()["content-length"] ?? 0);
        if (!type.includes("json") || size > MAX_JSON_BYTES) return;
        try {
          capture.json.push({ url: res.url(), body: await res.json() });
        } catch {
          // Body gone (redirect, page closed) or not really JSON.
        }
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await settle(page);
      return await fn(page, capture);
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    release();
  }
}

const BLOCK_PAGE =
  /access denied|you don't have permission to access|attention required|verify you are (a )?human|are you a robot|captcha|request blocked|bot detection/i;

// Bot-protection interstitials (Akamai, Cloudflare...). We don't try to get past them.
export async function isBlocked(page: Page): Promise<boolean> {
  const title = await page.title().catch(() => "");
  const text = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  return text.length < 3000 && BLOCK_PAGE.test(`${title} ${text}`);
}

export type RenderedPage = { url: string; html: string; requests: string[] };

export function renderPage(url: string): Promise<RenderedPage> {
  return withPage(url, async (page, capture) => ({
    url: page.url(),
    html: await page.content(),
    requests: capture.requests,
  }));
}

export async function closeBrowser(): Promise<void> {
  const launching = browser;
  browser = null;
  if (!launching) return;

  let launched: Browser;
  try {
    launched = await launching;
  } catch (error) {
    // A browser that never started (a missing system library, say) is a rejected promise, so there is
    // nothing to close. Each page that needed it was skipped on its own; say so once, and don't turn a
    // finished run into a crash.
    const reason = (error instanceof Error ? error.message : String(error)).split("\n")[0];
    console.error(`[browser] Chromium didn't start, so pages that need a browser were skipped: ${reason}`);
    return;
  }
  await launched.close().catch(() => {});
}
