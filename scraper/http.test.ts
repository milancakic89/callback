import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module keeps one policy per site for the whole run, so each test gets a fresh copy of it, and
// its own host (the per-host throttle would otherwise make the second request wait a second).
async function freshHttp() {
  vi.resetModules();
  return import("./http");
}

const fetchMock = vi.fn();
let n = 0;
const site = () => `https://site${++n}.example`;
const reply = (text: string, init: ResponseInit & { type?: string } = {}) =>
  new Response(text, { status: init.status ?? 200, headers: { "content-type": init.type ?? "text/plain" } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a site we go through, by its robots.txt", () => {
  it("is open when it has no robots.txt (RFC 9309: no file, no rules)", async () => {
    const { crawlPolicy } = await freshHttp();
    fetchMock.mockResolvedValue(reply("Not found", { status: 404 }));
    expect(await crawlPolicy(`${site()}/careers`)).toEqual({ allowed: true, error: null });
  });

  it("is open when nothing is disallowed: empty Disallow, Allow only, or only another bot's rules", async () => {
    const { crawlPolicy } = await freshHttp();
    for (const robots of [
      "User-agent: *\nDisallow:\n",
      "User-agent: *\nAllow: /\n",
      "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n",
      "# nothing here\nSitemap: https://example.com/sitemap.xml\n",
      "",
    ]) {
      fetchMock.mockResolvedValue(reply(robots));
      expect((await crawlPolicy(`${site()}/`)).allowed, JSON.stringify(robots)).toBe(true);
    }
  });

  it("is refused for ANY Disallow under *, even one for a path we never needed", async () => {
    const { crawlPolicy, ROBOTS_DISALLOWED } = await freshHttp();
    fetchMock.mockResolvedValue(reply("User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n"));

    const policy = await crawlPolicy(`${site()}/careers`);

    expect(policy.allowed).toBe(false);
    expect(policy.error).toContain(ROBOTS_DISALLOWED);
    expect(policy.error).toContain("/wp-admin/");
  });

  it("is refused for Disallow: /, however the line is written", async () => {
    const { crawlPolicy } = await freshHttp();
    for (const robots of [
      "User-agent: *\nDisallow: /",
      "USER-AGENT: *\nDISALLOW: /private  # keep out",
      "User-agent: Googlebot\nUser-agent: *\nDisallow: /a\n",
    ]) {
      fetchMock.mockResolvedValue(reply(robots));
      expect((await crawlPolicy(`${site()}/`)).allowed, robots).toBe(false);
    }
  });

  it("names the first few rules, and says there are more", async () => {
    const { crawlPolicy } = await freshHttp();
    fetchMock.mockResolvedValue(reply("User-agent: *\nDisallow: /a/\nDisallow: /b/\nDisallow: /c/\nDisallow: /d/\n"));
    const policy = await crawlPolicy(`${site()}/`);
    expect(policy.error).toBe("blocked by robots.txt: Disallow /a/ /b/ /c/ …");
  });

  it("is refused, but not as 'said no', when robots.txt can't be read: the site hasn't told us what it allows", async () => {
    const { crawlPolicy, isRobotsDisallowed, isRobotsRefusal } = await freshHttp();
    for (const status of [401, 403, 429, 500, 503]) {
      fetchMock.mockResolvedValue(reply("denied", { status }));
      const policy = await crawlPolicy(`${site()}/`);
      expect(policy.allowed, String(status)).toBe(false);
      expect(isRobotsRefusal(policy.error), String(status)).toBe(true);
      expect(isRobotsDisallowed(policy.error), String(status)).toBe(false);
    }
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const unreachable = await crawlPolicy(`${site()}/`);
    expect(unreachable.allowed).toBe(false);
    expect(isRobotsDisallowed(unreachable.error)).toBe(false);
  });

  it("is open for other 4xx and for a single-page app that answers /robots.txt with its HTML", async () => {
    const { crawlPolicy } = await freshHttp();
    fetchMock.mockResolvedValue(reply("gone", { status: 410 }));
    expect((await crawlPolicy(`${site()}/`)).allowed).toBe(true);
    fetchMock.mockResolvedValue(reply("<!doctype html><html><body>Disallow: / (not a robots file)</body></html>", { type: "text/html" }));
    expect((await crawlPolicy(`${site()}/`)).allowed).toBe(true);
  });

  it("is asked once per site, whatever the pages", async () => {
    const { crawlPolicy } = await freshHttp();
    fetchMock.mockResolvedValue(reply("User-agent: *\nDisallow: /x\n"));
    const origin = site();

    await Promise.all([crawlPolicy(`${origin}/a`), crawlPolicy(`${origin}/b?c=1`), crawlPolicy(`${origin}/careers`)]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(`${origin}/robots.txt`);
  });

  it("is judged per site: another host gets its own answer", async () => {
    const { crawlPolicy } = await freshHttp();
    fetchMock.mockResolvedValueOnce(reply("User-agent: *\nDisallow: /x\n")).mockResolvedValueOnce(reply("Not found", { status: 404 }));
    expect((await crawlPolicy(`${site()}/`)).allowed).toBe(false);
    expect((await crawlPolicy(`${site()}/`)).allowed).toBe(true);
  });
});

describe("fetchHtml", () => {
  it("doesn't touch the page of a site that forbids something, and says why", async () => {
    const { fetchHtml } = await freshHttp();
    fetchMock.mockResolvedValue(reply("User-agent: *\nDisallow: /admin/\n"));

    const page = await fetchHtml(`${site()}/careers`);

    expect(page).toMatchObject({ usable: false, blocked: true, status: 0 });
    expect(page.error).toContain("blocked by robots.txt: Disallow /admin/");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/robots\.txt$/);
  });

  it("reads the page of a site that forbids nothing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { fetchHtml } = await freshHttp();
    const origin = site();
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/robots.txt") ? reply("", { status: 404 }) : reply(`<html><body>${"x".repeat(3000)}</body></html>`, { type: "text/html" }),
    );

    const pending = fetchHtml(`${origin}/careers`);
    await vi.advanceTimersByTimeAsync(1500); // the second request to a host waits its second
    const page = await pending;

    expect(page).toMatchObject({ usable: true, blocked: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("disallowedPaths", () => {
  it("reads only the * group", async () => {
    const { disallowedPaths } = await freshHttp();
    const robots = "User-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /a\nDisallow: /b # why\nAllow: /c\n\nUser-agent: Bingbot\nDisallow: /d\n";
    expect(disallowedPaths(robots)).toEqual(["/a", "/b"]);
  });
});
