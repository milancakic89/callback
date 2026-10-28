import { beforeEach, describe, expect, it, vi } from "vitest";

const { crawlPolicy, getJson, request } = vi.hoisted(() => ({ crawlPolicy: vi.fn(), getJson: vi.fn(), request: vi.fn() }));
vi.mock("../http", async (importOriginal) => ({ ...(await importOriginal<typeof import("../http")>()), crawlPolicy, getJson, request }));

import { isRobotsDisallowed } from "../http";
import { talentlyft } from "./talentlyft";

beforeEach(() => {
  for (const mock of [crawlPolicy, getJson, request]) mock.mockReset();
});

// TalentLyft is two things: a widget API (a company id), and a career site it hosts for a company
// (a subdomain), whose list is HTML fetched page by page, which is walking the company's site.
describe("talentlyft", () => {
  it("does not walk a hosted career site whose robots.txt forbids something", async () => {
    crawlPolicy.mockResolvedValue({ allowed: false, error: "blocked by robots.txt: Disallow /api/" });

    const error = await talentlyft.fetchJobs("acme").catch((e: Error) => e);

    expect(crawlPolicy).toHaveBeenCalledWith("https://acme.talentlyft.com");
    expect(request).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(Error);
    expect(isRobotsDisallowed((error as Error).message)).toBe(true);
  });

  it("walks it, as before, when nothing is forbidden", async () => {
    crawlPolicy.mockResolvedValue({ allowed: true, error: null });
    request.mockResolvedValue({ status: 200, text: "<div></div>", url: "", contentType: "text/html" });

    expect(await talentlyft.fetchJobs("acme")).toEqual([]);
    expect(request).toHaveBeenCalledOnce();
  });

  it("reads the widget's public API without asking any site's robots.txt", async () => {
    getJson.mockResolvedValue({ status: 200, data: { Results: [], Pages: { Next: null } } });

    expect(await talentlyft.fetchJobs("0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f")).toEqual([]);
    expect(crawlPolicy).not.toHaveBeenCalled();
  });
});
