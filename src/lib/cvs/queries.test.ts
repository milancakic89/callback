import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

import { getMyCallbackApplicationFor, getMyCallbackApplications } from "./queries";

const row = (fields: Record<string, unknown>) => ({
  id: "app-1",
  job_id: "job-1",
  title: "Product Designer",
  company_name: "Acme",
  applied_at: "2026-11-01T09:00:00+00:00",
  state: "active",
  cv_file_name: "cv.pdf",
  cover_letter_kind: null,
  cover_letter_text: null,
  stage: "APPLIED",
  step_name: null,
  step_description: null,
  stage_at: null,
  step_updated_at: null,
  ...fields,
});

beforeEach(() => vi.clearAllMocks());

describe("getMyCallbackApplications", () => {
  it("asks for the caller's applications", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    expect(await getMyCallbackApplications()).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("my_job_applications");
  });

  it("maps the status the company applied, with the step's name and text", async () => {
    rpc.mockResolvedValue({
      data: [
        row({
          stage: "STEP",
          step_name: "Interview",
          step_description: "A short call.",
          stage_at: "2026-11-09T10:00:00+00:00",
          step_updated_at: "2026-11-10T10:00:00+00:00",
        }),
      ],
      error: null,
    });

    const [application] = await getMyCallbackApplications();

    expect(application.status).toEqual({
      stage: "STEP",
      stepName: "Interview",
      stepDescription: "A short call.",
      stageAt: "2026-11-09T10:00:00+00:00",
      stepUpdatedAt: "2026-11-10T10:00:00+00:00",
    });
  });

  it("has no status for an application that was withdrawn, by either side", async () => {
    rpc.mockResolvedValue({
      data: [row({ id: "a", state: "withdrawn" }), row({ id: "b", state: "you_withdrew" })],
      error: null,
    });

    const applications = await getMyCallbackApplications();

    expect(applications.map((application) => application.status)).toEqual([null, null]);
  });

  it("keeps the status of a paused application", async () => {
    rpc.mockResolvedValue({ data: [row({ state: "paused", stage: "OFFER" })], error: null });

    const [application] = await getMyCallbackApplications();

    expect(application.status?.stage).toBe("OFFER");
  });

  it("throws on a database error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getMyCallbackApplications()).rejects.toThrow("getMyCallbackApplications: boom");
  });
});

describe("getMyCallbackApplicationFor", () => {
  it("finds the caller's application to one job", async () => {
    rpc.mockResolvedValue({
      data: [row({ id: "a", job_id: "job-a" }), row({ id: "b", job_id: "job-b", title: "Other job" })],
      error: null,
    });

    const application = await getMyCallbackApplicationFor("job-b");

    expect(application?.id).toBe("b");
    expect(application?.title).toBe("Other job");
  });

  it("answers null for a job they haven't applied to", async () => {
    rpc.mockResolvedValue({ data: [row({ job_id: "job-a" })], error: null });

    expect(await getMyCallbackApplicationFor("job-z")).toBeNull();
  });

  it("answers null when they have applied to nothing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    expect(await getMyCallbackApplicationFor("job-a")).toBeNull();
  });

  it("keeps an application the job has stopped being open for", async () => {
    rpc.mockResolvedValue({ data: [row({ job_id: "job-a", state: "paused" })], error: null });

    expect((await getMyCallbackApplicationFor("job-a"))?.state).toBe("paused");
  });

  it("throws on a database error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getMyCallbackApplicationFor("job-a")).rejects.toThrow("getMyCallbackApplications: boom");
  });
});
