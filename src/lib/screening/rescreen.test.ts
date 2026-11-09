import { beforeEach, describe, expect, it, vi } from "vitest";

const { maybeSingle, update, updateEq, updateIs, listReturns, rpc, from, get, screenCv } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const updateIs = vi.fn();
  const updateEq = vi.fn(() => ({ is: updateIs }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const listReturns = vi.fn();
  const listIs = vi.fn(() => ({ returns: listReturns }));
  const listEq = vi.fn(() => ({ is: listIs }));
  const selectList = vi.fn(() => ({ eq: listEq, maybeSingle }));
  const jobEq = vi.fn(() => ({ maybeSingle }));
  return {
    maybeSingle,
    update,
    updateEq,
    updateIs,
    listReturns,
    rpc: vi.fn(),
    from: vi.fn((table: string) =>
      table === "job_postings" ? { select: () => ({ eq: jobEq }) } : { update, select: selectList },
    ),
    get: vi.fn(),
    screenCv: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from, rpc } }));
vi.mock("@/lib/storage/documents", () => ({ documentStore: { get } }));
vi.mock("./index", () => ({ screenCv, screeningEngine: { id: "keywords-v1" } }));

import { rescreenJob } from "./rescreen";

const JOB_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";
const stream = (text: string) => new Blob([text]).stream();

const COLUMNS = {
  matched_filters: ["Figma"],
  unverified_filters: [] as string[],
  screening_outcome: "checked" as const,
  screened_at: "2026-11-09T10:00:00.000Z",
  screening_engine: "keywords-v1",
};

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({
    data: { required_filters: ["Figma"], optional_filters: ["Mentoring"], is_demo: false },
    error: null,
  });
  updateIs.mockResolvedValue({ error: null });
  listReturns.mockResolvedValue({
    data: [
      { id: "app-1", cv_path: "applications/app-1/cv/Ana CV.pdf" },
      { id: "app-2", cv_path: "applications/app-2/cv/Jonas CV.pdf" },
    ],
    error: null,
  });
  get.mockImplementation(async (key: string) => stream(`bytes of ${key}`));
  screenCv.mockResolvedValue(COLUMNS);
  rpc.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("rescreenJob", () => {
  it("clears the results of the job's active applications, then checks each CV against the filters it read", async () => {
    await rescreenJob(JOB_ID);

    expect(from).toHaveBeenCalledWith("job_applications");
    expect(update).toHaveBeenCalledExactlyOnceWith({
      matched_filters: null,
      unverified_filters: null,
      screening_outcome: null,
      screened_at: null,
      screening_engine: null,
    });
    expect(updateEq).toHaveBeenCalledExactlyOnceWith("job_posting_id", JOB_ID);
    expect(updateIs).toHaveBeenCalledExactlyOnceWith("withdrawn_at", null);

    expect(get.mock.calls.map((call) => call[0])).toEqual([
      "applications/app-1/cv/Ana CV.pdf",
      "applications/app-2/cv/Jonas CV.pdf",
    ]);
    expect(screenCv).toHaveBeenCalledTimes(2);
    const [cv, filters] = screenCv.mock.calls[0] as unknown as [{ bytes: Uint8Array; fileName: string }, unknown];
    expect(cv.fileName).toBe("Ana CV.pdf");
    expect(new TextDecoder().decode(cv.bytes)).toBe("bytes of applications/app-1/cv/Ana CV.pdf");
    expect(filters).toEqual({ required: ["Figma"], optional: ["Mentoring"] });
  });

  it("saves each result through save_screening, with the filters it was made for", async () => {
    await rescreenJob(JOB_ID);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "save_screening", {
      p_application_id: "app-1",
      p_required: ["Figma"],
      p_optional: ["Mentoring"],
      p_matched: ["Figma"],
      p_unverified: [],
      p_outcome: "checked",
      p_engine: "keywords-v1",
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_application_id: "app-2" });
  });

  it("clears and stops when the job has no filters any more", async () => {
    maybeSingle.mockResolvedValue({ data: { required_filters: [], optional_filters: [], is_demo: false }, error: null });

    await rescreenJob(JOB_ID);

    expect(update).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never touches the demo job, or a job that isn't there", async () => {
    maybeSingle.mockResolvedValue({ data: { required_filters: ["Figma"], optional_filters: [], is_demo: true }, error: null });
    await rescreenJob(JOB_ID);
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await rescreenJob(JOB_ID);

    expect(update).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("skips an application whose file is missing or has no CV, and carries on with the others", async () => {
    listReturns.mockResolvedValue({
      data: [
        { id: "no-cv", cv_path: null },
        { id: "gone", cv_path: "applications/gone/cv/x.pdf" },
        { id: "app-ok", cv_path: "applications/app-ok/cv/ok.pdf" },
      ],
      error: null,
    });
    get.mockImplementation(async (key: string) => (key.includes("gone") ? null : stream("pdf")));

    await rescreenJob(JOB_ID);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_application_id: "app-ok" });
  });

  it("logs a failure on one application and still checks the rest", async () => {
    get.mockRejectedValueOnce(new Error("R2 get failed: 503"));

    await rescreenJob(JOB_ID);

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_application_id: "app-2" });
    expect(console.error).toHaveBeenCalled();
  });

  it("saves nothing for an application the engine gave no result for", async () => {
    screenCv.mockResolvedValueOnce(null);

    await rescreenJob(JOB_ID);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("stops without checking anything when the results can't be cleared", async () => {
    updateIs.mockResolvedValue({ error: { code: "XX000", message: "boom" } });

    await rescreenJob(JOB_ID);
    expect(get).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not throw when the save is refused or fails", async () => {
    rpc.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    await expect(rescreenJob(JOB_ID)).resolves.toBeUndefined();
  });
});
