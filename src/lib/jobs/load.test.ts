import { describe, expect, it, vi } from "vitest";
import { loadDescription, loadDescriptionBundle, loadJobList, type FetchJson } from "./load";

function answering(status: number, body: unknown): FetchJson {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
}

const JOB = {
  id: "greenhouse:42",
  title: "Backend Engineer",
  companyName: "Elsewhere",
  locationRaw: null,
  department: null,
  workMode: null,
  postedAt: null,
  firstSeenAt: "2026-11-01T00:00:00.000Z",
  url: null,
  source: "greenhouse",
  active: true,
};

describe("loadJobList", () => {
  it("fetches the list from its route and returns the jobs", async () => {
    const fetchJson = answering(200, [JOB]);

    expect(await loadJobList(fetchJson)).toEqual([JOB]);
    expect(fetchJson).toHaveBeenCalledExactlyOnceWith("/api/jobs/list");
  });

  it("throws on an error status", async () => {
    await expect(loadJobList(answering(500, null))).rejects.toThrow("/api/jobs/list: 500");
  });

  it("throws on an answer that isn't a list", async () => {
    await expect(loadJobList(answering(200, { jobs: [] }))).rejects.toThrow("not a list");
  });

  it("throws when the request itself fails", async () => {
    const offline: FetchJson = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(loadJobList(offline)).rejects.toThrow("Failed to fetch");
  });
});

describe("loadDescriptionBundle", () => {
  it("fetches every description from the bundle route", async () => {
    const fetchJson = answering(200, { "greenhouse:42": "Text." });

    expect(await loadDescriptionBundle(fetchJson)).toEqual({ "greenhouse:42": "Text." });
    expect(fetchJson).toHaveBeenCalledExactlyOnceWith("/api/jobs/descriptions");
  });

  it("throws on an error status", async () => {
    await expect(loadDescriptionBundle(answering(502, null))).rejects.toThrow("/api/jobs/descriptions: 502");
  });

  it("throws on an answer that isn't an object of descriptions", async () => {
    await expect(loadDescriptionBundle(answering(200, []))).rejects.toThrow("not an object");
    await expect(loadDescriptionBundle(answering(200, null))).rejects.toThrow("not an object");
  });
});

describe("loadDescription", () => {
  it("fetches one job's description, with the id encoded into the path", async () => {
    const fetchJson = answering(200, { description: "Own the design." });

    expect(await loadDescription(fetchJson, "himalayas:acme/senior designer")).toBe("Own the design.");
    expect(fetchJson).toHaveBeenCalledExactlyOnceWith("/api/jobs/descriptions/himalayas%3Aacme%2Fsenior%20designer");
  });

  it("is null for a job with no description: the route answers 404", async () => {
    expect(await loadDescription(answering(404, null), "greenhouse:42")).toBeNull();
  });

  it("is null when the answer carries no text", async () => {
    expect(await loadDescription(answering(200, { description: "" }), "greenhouse:42")).toBeNull();
    expect(await loadDescription(answering(200, {}), "greenhouse:42")).toBeNull();
    expect(await loadDescription(answering(200, null), "greenhouse:42")).toBeNull();
  });

  it("throws on any other error status, so a failed request isn't shown as 'no description'", async () => {
    await expect(loadDescription(answering(500, null), "greenhouse:42")).rejects.toThrow("500");
  });
});
