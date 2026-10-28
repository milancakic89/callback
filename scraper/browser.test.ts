import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { launch, crawlPolicy } = vi.hoisted(() => ({ launch: vi.fn(), crawlPolicy: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { launch } }));
vi.mock("./http", () => ({ USER_AGENT: "test-agent", crawlPolicy }));

// `browser` is module state, so each test gets a fresh copy of the module.
async function freshBrowserModule() {
  vi.resetModules();
  return import("./browser");
}

beforeEach(() => {
  launch.mockReset();
  crawlPolicy.mockReset();
  crawlPolicy.mockResolvedValue({ allowed: true, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// On the server, Chromium failed to start (a missing system library). The run itself finished, but
// closeBrowser() awaited the rejected launch inside `.finally()`, so the process crashed with exit
// code 1 and a stack trace after printing "[refresh] done".
describe("closeBrowser when Chromium never started", () => {
  it("doesn't throw, and says so once", async () => {
    launch.mockRejectedValue(new Error("browserType.launch: libatk-1.0.so.0 missing\nCall log:\n  - <launching> …"));
    const { withPage, closeBrowser } = await freshBrowserModule();

    await expect(withPage("https://example.com", async () => "never")).rejects.toThrow(/libatk/);
    await expect(closeBrowser()).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledOnce();
    const message = vi.mocked(console.error).mock.calls[0][0] as string;
    expect(message).toContain("libatk-1.0.so.0 missing");
    expect(message).not.toContain("Call log");
  });

  it("does nothing when no page ever asked for a browser", async () => {
    const { closeBrowser } = await freshBrowserModule();

    await expect(closeBrowser()).resolves.toBeUndefined();
    expect(launch).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("closeBrowser when Chromium started", () => {
  it("closes it, once, and a second call has nothing left to close", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    launch.mockResolvedValue({ newContext: vi.fn().mockRejectedValue(new Error("no context in a test")), close });
    const { withPage, closeBrowser } = await freshBrowserModule();

    await expect(withPage("https://example.com", async () => "never")).rejects.toThrow("no context");
    await closeBrowser();
    await closeBrowser();

    expect(close).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("doesn't fail when closing it fails", async () => {
    launch.mockResolvedValue({
      newContext: vi.fn().mockRejectedValue(new Error("no context in a test")),
      close: vi.fn().mockRejectedValue(new Error("already gone")),
    });
    const { withPage, closeBrowser } = await freshBrowserModule();

    await expect(withPage("https://example.com", async () => "never")).rejects.toThrow();
    await expect(closeBrowser()).resolves.toBeUndefined();
  });
});

// Every page the browser opens goes through withPage, so this is where robots.txt (http.ts) is kept.
describe("withPage on a site whose robots.txt forbids something", () => {
  it("opens nothing, not even a browser, and says why", async () => {
    crawlPolicy.mockResolvedValue({ allowed: false, error: "blocked by robots.txt: Disallow /wp-admin/" });
    const { withPage, closeBrowser } = await freshBrowserModule();
    const fn = vi.fn();

    await expect(withPage("https://acme.example/careers", fn)).rejects.toThrow("blocked by robots.txt: Disallow /wp-admin/");

    expect(crawlPolicy).toHaveBeenCalledWith("https://acme.example/careers");
    expect(launch).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
    await expect(closeBrowser()).resolves.toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("opens a page on a site that forbids nothing, as before", async () => {
    launch.mockResolvedValue({ newContext: vi.fn().mockRejectedValue(new Error("no context in a test")), close: vi.fn() });
    const { withPage } = await freshBrowserModule();

    await expect(withPage("https://open.example/careers", async () => "never")).rejects.toThrow("no context");
    expect(launch).toHaveBeenCalledOnce();
  });
});
