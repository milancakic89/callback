import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, returns, maybeSingle, eq, select } = vi.hoisted(() => {
  const returns = vi.fn();
  const maybeSingle = vi.fn();
  const eq: ReturnType<typeof vi.fn> = vi.fn(() => ({ returns, eq, maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })), returns, maybeSingle, eq, select };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

import { findExternalApplication, getExternalApplications } from "./queries";

const row = (fields: Record<string, unknown> = {}) => ({
  id: "ext-1",
  source: "linkedin",
  url: "https://www.linkedin.com/jobs/view/4463907148/",
  title: "Data Engineer",
  company_name: "Gamma",
  location: "Belgrade",
  cv_id: "cv-1",
  status: "PENDING",
  applied_at: "2026-11-03T09:00:00+00:00",
  ...fields,
});

beforeEach(() => vi.clearAllMocks());

describe("getExternalApplications", () => {
  it("reads the caller's own rows", async () => {
    returns.mockResolvedValue({ data: [], error: null });

    await getExternalApplications("user-1");

    expect(from).toHaveBeenCalledWith("external_applications");
    expect(select).toHaveBeenCalledWith("id, source, url, title, company_name, location, cv_id, status, applied_at");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("maps each row as an external application, with no CV name yet", async () => {
    returns.mockResolvedValue({ data: [row(), row({ id: "ext-2", source: "infostud", cv_id: null, location: null })], error: null });

    expect(await getExternalApplications("user-1")).toEqual([
      {
        kind: "external",
        id: "ext-1",
        source: "linkedin",
        status: "PENDING",
        appliedAt: "2026-11-03T09:00:00+00:00",
        title: "Data Engineer",
        companyName: "Gamma",
        location: "Belgrade",
        url: "https://www.linkedin.com/jobs/view/4463907148/",
        cvId: "cv-1",
        cvFileName: null,
      },
      expect.objectContaining({ id: "ext-2", source: "infostud", cvId: null, location: null }),
    ]);
  });

  it("leaves out a row whose source isn't one of the three", async () => {
    returns.mockResolvedValue({ data: [row({ source: "indeed" }), row({ id: "ext-2" })], error: null });

    expect((await getExternalApplications("user-1")).map((item) => item.id)).toEqual(["ext-2"]);
  });

  it("is empty for a candidate with none", async () => {
    returns.mockResolvedValue({ data: null, error: null });

    expect(await getExternalApplications("user-1")).toEqual([]);
  });

  it("throws on a database error", async () => {
    returns.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getExternalApplications("user-1")).rejects.toThrow("getExternalApplications: boom");
  });
});

describe("findExternalApplication", () => {
  it("looks the job up by its address, for the caller only", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "ext-1", status: "OFFER", title: "Data Engineer", company_name: "Gamma" }, error: null });

    expect(await findExternalApplication("user-1", "https://www.linkedin.com/jobs/view/4463907148/")).toEqual({
      id: "ext-1",
      status: "OFFER",
      title: "Data Engineer",
      companyName: "Gamma",
    });
    expect(select).toHaveBeenCalledWith("id, status, title, company_name");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq).toHaveBeenCalledWith("url", "https://www.linkedin.com/jobs/view/4463907148/");
  });

  it("is null when the candidate hasn't added it", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await findExternalApplication("user-1", "https://www.linkedin.com/jobs/view/4463907148/")).toBeNull();
  });

  it("throws on a database error", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(findExternalApplication("user-1", "u")).rejects.toThrow("findExternalApplication: boom");
  });
});
