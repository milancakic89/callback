import { beforeEach, describe, expect, it, vi } from "vitest";

const { getJson, fetchHtml } = vi.hoisted(() => ({ getJson: vi.fn(), fetchHtml: vi.fn() }));
vi.mock("../http", () => ({ getJson, fetchHtml }));

import { bamboohr } from "./bamboohr";
import { successfactors } from "./successfactors";
import { workday } from "./workday";

beforeEach(() => {
  getJson.mockReset();
  fetchHtml.mockReset();
});

// What these three detail calls were measured to give on live boards (2026-10-27): Workday's cxs
// detail has `startDate` (the list only says "Posted 5 Days Ago"), BambooHR's has `datePosted`, and a
// SuccessFactors job page has itemprop="datePosted". They were already fetched for the description,
// so the date costs no extra request.

describe("workday.fetchDetails", () => {
  const job = {
    externalId: "R-1001",
    url: "https://acme.wd3.myworkdayjobs.com/careers/job/Belgrade/Dev_R-1001",
  };

  it("gives the description and the day the job was posted, from one call", async () => {
    getJson.mockResolvedValue({
      status: 200,
      data: { jobPostingInfo: { jobDescription: "<p>Build things</p>", startDate: "2026-10-22", postedOn: "Posted 5 Days Ago" } },
    });

    expect(await workday.fetchDetails!(job)).toEqual({ description: "Build things", postedAt: "2026-10-22T00:00:00.000Z" });
    expect(getJson).toHaveBeenCalledOnce();
    expect(getJson).toHaveBeenCalledWith("https://acme.wd3.myworkdayjobs.com/wday/cxs/acme/careers/job/Belgrade/Dev_R-1001");
  });

  it("answers with no date when the detail has none, without failing", async () => {
    getJson.mockResolvedValue({ status: 200, data: { jobPostingInfo: { jobDescription: "<p>Text</p>" } } });
    expect(await workday.fetchDetails!(job)).toEqual({ description: "Text", postedAt: null });
  });

  it("does not take a date it can't read, such as the list's relative one", async () => {
    getJson.mockResolvedValue({ status: 200, data: { jobPostingInfo: { startDate: "Posted 5 Days Ago" } } });
    expect((await workday.fetchDetails!(job))?.postedAt).toBeNull();
  });

  it("is null, not an empty answer, when the call failed or isn't a Workday job url", async () => {
    getJson.mockResolvedValue({ status: 500, data: null });
    expect(await workday.fetchDetails!(job)).toBeNull();
    getJson.mockResolvedValue({ status: 200, data: { unexpected: true } });
    expect(await workday.fetchDetails!(job)).toBeNull();
    expect(await workday.fetchDetails!({ externalId: "x", url: "https://example.com/job/1" })).toBeNull();
    expect(await workday.fetchDetails!({ externalId: "x", url: null })).toBeNull();
  });
});

describe("bamboohr.fetchDetails", () => {
  const job = { externalId: "42", url: "https://acme.bamboohr.com/careers/42" };

  it("gives the description and the date from the detail call", async () => {
    getJson.mockResolvedValue({
      status: 200,
      data: { result: { jobOpening: { description: "<p>Design things</p>", datePosted: "2026-02-12" } } },
    });

    expect(await bamboohr.fetchDetails!(job)).toEqual({ description: "Design things", postedAt: "2026-02-12T00:00:00.000Z" });
    expect(getJson).toHaveBeenCalledWith("https://acme.bamboohr.com/careers/42/detail");
  });

  it("answers with no date when there is none", async () => {
    getJson.mockResolvedValue({ status: 200, data: { result: { jobOpening: { description: "<p>Text</p>" } } } });
    expect(await bamboohr.fetchDetails!(job)).toEqual({ description: "Text", postedAt: null });
  });

  it("is null when the call failed or the url isn't BambooHR's", async () => {
    getJson.mockResolvedValue({ status: 404, data: null });
    expect(await bamboohr.fetchDetails!(job)).toBeNull();
    expect(await bamboohr.fetchDetails!({ externalId: "1", url: "https://example.com/x" })).toBeNull();
  });
});

describe("successfactors.fetchDetails", () => {
  const job = { externalId: "123", url: "https://jobs.example.com/job/Belgrade-Dev/123/" };
  const html = (body: string) => ({ usable: true, html: `<!doctype html><html><body>${body}</body></html>`, error: null });

  it("gives the description and the itemprop datePosted from the job page", async () => {
    fetchHtml.mockResolvedValue(
      html(
        '<meta itemprop="datePosted" content="Thu Oct 01 02:00:00 UTC 2026"><span itemprop="description"><p>Run the SAP</p></span>',
      ),
    );

    expect(await successfactors.fetchDetails!(job)).toEqual({ description: "Run the SAP", postedAt: "2026-10-01T02:00:00.000Z" });
  });

  it("answers with no date when the page has none", async () => {
    fetchHtml.mockResolvedValue(html('<span itemprop="description"><p>Run the SAP</p></span>'));
    expect(await successfactors.fetchDetails!(job)).toEqual({ description: "Run the SAP", postedAt: null });
  });

  it("is null when the page couldn't be read", async () => {
    fetchHtml.mockResolvedValue({ usable: false, html: "", error: "HTTP 503" });
    expect(await successfactors.fetchDetails!(job)).toBeNull();
    expect(await successfactors.fetchDetails!({ externalId: "1", url: null })).toBeNull();
  });
});
