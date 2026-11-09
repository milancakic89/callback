import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAccountType,
  hit,
  select,
  eq,
  insert,
  update,
  updateEq,
  updateSelect,
  rpc,
  from,
  refresh,
  updateTag,
  after,
  rescreenJob,
  drainStorageDeletions,
  currentFilters,
  redirect,
  ensureEmployerWorkspace,
} = vi.hoisted(() => {
  const select = vi.fn();
  const eq = vi.fn(() => ({ select }));
  const deleteRows = vi.fn(() => ({ eq }));
  const insert = vi.fn();
  const updateSelect = vi.fn();
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn<(values: Record<string, unknown>) => { eq: typeof updateEq }>(() => ({ eq: updateEq }));
  // The job's filters as they are before an edit (read with .select().eq().maybeSingle()).
  const currentFilters = vi.fn();
  const selectFilters = vi.fn(() => ({ eq: () => ({ maybeSingle: currentFilters }) }));
  return {
    requireAccountType: vi.fn(),
    hit: vi.fn(),
    select,
    eq,
    insert,
    update,
    updateEq,
    updateSelect,
    rpc: vi.fn(),
    from: vi.fn(() => ({ delete: deleteRows, insert, update, select: selectFilters })),
    refresh: vi.fn(),
    updateTag: vi.fn(),
    // The real `after()` runs the callback once the response is sent; here it is only recorded.
    after: vi.fn<(task: () => unknown) => void>(),
    rescreenJob: vi.fn(),
    drainStorageDeletions: vi.fn(),
    currentFilters,
    redirect: vi.fn(),
    ensureEmployerWorkspace: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ refresh, updateTag }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/screening/rescreen", () => ({ rescreenJob }));
vi.mock("@/lib/storage/deletions", () => ({ drainStorageDeletions }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/companies/workspace", () => ({ ensureEmployerWorkspace }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from, rpc }) }));

import {
  applyApplicationStages,
  createJobPosting,
  deleteJobPosting,
  markApplicationViewed,
  publishJobPosting,
  setApplicationLiked,
  setApplicationStage,
  unpublishJobPosting,
  updateJobPosting,
} from "./actions";

const JOB_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";
const COMPANY_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const OTHER_JOB_ID = "5f8d3c21-6b7a-4c19-8e42-0a1b2c3d4e5f";

beforeEach(() => {
  vi.clearAllMocks();
  requireAccountType.mockResolvedValue({
    id: "user-1",
    email: "boss@acme.example",
    accountType: "employer",
    companySlug: "acme",
  });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  select.mockResolvedValue({ data: [{ id: JOB_ID }], error: null });
  insert.mockResolvedValue({ error: null });
  updateSelect.mockResolvedValue({ data: [{ id: JOB_ID }], error: null });
  currentFilters.mockResolvedValue({ data: { required_filters: [], optional_filters: [] }, error: null });
  rpc.mockResolvedValue({ data: null, error: null });
  ensureEmployerWorkspace.mockResolvedValue(COMPANY_ID);
  // The real redirect() throws to stop the action; so does this one.
  redirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

describe("deleteJobPosting", () => {
  it("refuses an id that isn't a uuid, before anything else runs", async () => {
    for (const jobId of ["", "1", "not-a-uuid", `${JOB_ID}; drop table job_postings`]) {
      expect(await deleteJobPosting(jobId), jobId).toEqual({ ok: false, error: "Invalid request." });
    }
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(deleteJobPosting(JOB_ID)).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(from).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says the job wasn't found when row level security deletes nothing", async () => {
    select.mockResolvedValue({ data: [], error: null });

    expect(await deleteJobPosting(JOB_ID)).toEqual({ ok: false, error: "Job not found." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a database error without saying it was deleted", async () => {
    select.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await deleteJobPosting(JOB_ID)).toEqual({ ok: false, error: "Could not delete. Try again." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("deletes the job and refreshes the dashboard", async () => {
    expect(await deleteJobPosting(JOB_ID)).toEqual({ ok: true });

    expect(from).toHaveBeenCalledWith("job_postings");
    expect(eq).toHaveBeenCalledWith("id", JOB_ID);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("deletes the files its applications let go of, after the response", async () => {
    await deleteJobPosting(JOB_ID);

    expect(after).toHaveBeenCalledExactlyOnceWith(drainStorageDeletions);
  });

  it("deletes no files when nothing was deleted", async () => {
    select.mockResolvedValue({ data: [], error: null });
    await deleteJobPosting(JOB_ID);
    select.mockResolvedValue({ data: null, error: { message: "boom" } });
    await deleteJobPosting(JOB_ID);

    expect(after).not.toHaveBeenCalled();
  });

  it("takes a published job off the job board at once, and leaves the board alone for a draft", async () => {
    select.mockResolvedValue({ data: [{ id: JOB_ID, published_at: "2026-11-09T10:00:00.000Z" }], error: null });
    await deleteJobPosting(JOB_ID);
    expect(updateTag).toHaveBeenCalledExactlyOnceWith("jobs");

    updateTag.mockClear();
    select.mockResolvedValue({ data: [{ id: JOB_ID, published_at: null }], error: null });
    await deleteJobPosting(JOB_ID);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("is limited to 30 a minute per employer", async () => {
    await deleteJobPosting(JOB_ID);
    expect(hit).toHaveBeenCalledWith("delete-job:user-1", 60_000);

    hit.mockResolvedValue({ count: 30, resetAt: Date.now() + 60_000 });
    expect(await deleteJobPosting(JOB_ID)).toEqual({ ok: true });

    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });
    from.mockClear();
    refresh.mockClear();
    expect(await deleteJobPosting(JOB_ID)).toEqual({
      ok: false,
      error: "Too many changes. Try again in a minute.",
    });
    expect(from).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

// `lists` are the repeated entries the chips send (one hidden input per filter).
function jobForm(fields: Record<string, string> = {}, lists: Record<string, string[]> = {}) {
  const formData = new FormData();
  const values = {
    title: "Senior React Developer",
    description: "Build things.",
    location: "Belgrade, Serbia",
    workMode: "HYBRID",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) formData.set(name, value);
  for (const [name, entries] of Object.entries(lists)) {
    for (const entry of entries) formData.append(name, entry);
  }
  return formData;
}

describe("createJobPosting", () => {
  it("answers the field errors and touches nothing when the input is invalid", async () => {
    const result = await createJobPosting({}, jobForm({ title: "  ", description: "", workMode: "ANYWHERE" }));

    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["description", "title", "workMode"]);
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("treats a missing field as empty", async () => {
    const result = await createJobPosting({}, new FormData());

    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["description", "title"]);
    expect(from).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(createJobPosting({}, jobForm())).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(ensureEmployerWorkspace).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("is limited to 20 an hour per employer", async () => {
    await expect(createJobPosting({}, jobForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(hit).toHaveBeenCalledWith("create-job:user-1", 60 * 60_000);

    hit.mockResolvedValue({ count: 20, resetAt: Date.now() + 60_000 });
    await expect(createJobPosting({}, jobForm())).rejects.toThrow("NEXT_REDIRECT");

    hit.mockResolvedValue({ count: 21, resetAt: Date.now() + 60_000 });
    insert.mockClear();
    redirect.mockClear();
    expect(await createJobPosting({}, jobForm())).toEqual({
      error: "You've posted a lot of jobs. Try again in an hour.",
    });
    expect(insert).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("inserts the job into the company from the workspace, with only the seven columns, and goes to the dashboard", async () => {
    await expect(
      createJobPosting(
        {},
        jobForm(
          { title: "  Senior React Developer  " },
          { requiredFilters: ["React", " 5+ years "], optionalFilters: ["English C1"] },
        ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/acme");

    expect(from).toHaveBeenCalledWith("job_postings");
    expect(insert).toHaveBeenCalledExactlyOnceWith({
      company_id: COMPANY_ID,
      title: "Senior React Developer",
      description: "Build things.",
      location_raw: "Belgrade, Serbia",
      work_mode: "HYBRID",
      required_filters: ["React", "5+ years"],
      optional_filters: ["English C1"],
    });
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/acme");
  });

  it("stores empty filter lists when the form sends no filters", async () => {
    await expect(createJobPosting({}, jobForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ required_filters: [], optional_filters: [] }));
  });

  it("answers a filter error on its list and touches nothing", async () => {
    const result = await createJobPosting({}, jobForm({}, { requiredFilters: ["React"], optionalFilters: ["react"] }));

    expect(result.fieldErrors).toEqual({ optionalFilters: ["“react” is already a required filter."] });
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("stores an empty location and work mode as null", async () => {
    await expect(createJobPosting({}, jobForm({ location: "", workMode: "" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ location_raw: null, work_mode: null }));
  });

  it("ignores a company id or a demo flag sent in the form", async () => {
    await expect(
      createJobPosting({}, jobForm({ company_id: "00000000-0000-4000-8000-000000000000", is_demo: "true" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    const [row] = insert.mock.calls[0];
    expect(row.company_id).toBe(COMPANY_ID);
    expect(row).not.toHaveProperty("is_demo");
  });

  it("reports a database error without redirecting", async () => {
    insert.mockResolvedValue({ error: { message: "boom" } });

    expect(await createJobPosting({}, jobForm())).toEqual({ error: "Could not save the job. Try again." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports a failure to find the company without inserting", async () => {
    ensureEmployerWorkspace.mockRejectedValue(new Error("ensureEmployerWorkspace: boom"));

    expect(await createJobPosting({}, jobForm())).toEqual({ error: "Could not save the job. Try again." });
    expect(insert).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

function editForm(fields: Record<string, string> = {}, lists: Record<string, string[]> = {}) {
  const formData = jobForm(fields, lists);
  if (!("jobId" in fields)) formData.set("jobId", JOB_ID);
  return formData;
}

describe("updateJobPosting", () => {
  it("refuses an id that isn't a uuid, before anything else runs", async () => {
    for (const jobId of ["", "1", "not-a-uuid"]) {
      expect(await updateJobPosting({}, editForm({ jobId })), jobId).toEqual({ error: "Invalid request." });
    }
    expect(await updateJobPosting({}, jobForm())).toEqual({ error: "Invalid request." });
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("answers the field errors and touches nothing when the fields are invalid", async () => {
    const result = await updateJobPosting({}, editForm({ title: " ", workMode: "ANYWHERE" }));

    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(["title", "workMode"]);
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(updateJobPosting({}, editForm())).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(from).not.toHaveBeenCalled();
  });

  it("is limited to 60 an hour per employer", async () => {
    await expect(updateJobPosting({}, editForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(hit).toHaveBeenCalledWith("edit-job:user-1", 60 * 60_000);

    hit.mockResolvedValue({ count: 60, resetAt: Date.now() + 60_000 });
    await expect(updateJobPosting({}, editForm())).rejects.toThrow("NEXT_REDIRECT");

    hit.mockResolvedValue({ count: 61, resetAt: Date.now() + 60_000 });
    update.mockClear();
    expect(await updateJobPosting({}, editForm())).toEqual({
      error: "You've made a lot of changes. Try again in an hour.",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates exactly the six columns of that job and goes to the dashboard", async () => {
    await expect(
      updateJobPosting(
        {},
        editForm(
          { title: "  Staff Designer  ", location: "", workMode: "REMOTE" },
          { requiredFilters: ["Figma"], optionalFilters: ["Motion", "Illustration"] },
        ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/acme");

    expect(from).toHaveBeenCalledWith("job_postings");
    expect(update).toHaveBeenCalledExactlyOnceWith({
      title: "Staff Designer",
      description: "Build things.",
      location_raw: null,
      work_mode: "REMOTE",
      required_filters: ["Figma"],
      optional_filters: ["Motion", "Illustration"],
    });
    expect(updateEq).toHaveBeenCalledExactlyOnceWith("id", JOB_ID);
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/acme");
  });

  it("ignores a company id, a demo flag or a published date sent in the form", async () => {
    await expect(
      updateJobPosting(
        {},
        editForm({ company_id: COMPANY_ID, is_demo: "true", published_at: "2026-10-30T00:00:00Z" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(Object.keys(update.mock.calls[0][0]).sort()).toEqual([
      "description",
      "location_raw",
      "optional_filters",
      "required_filters",
      "title",
      "work_mode",
    ]);
  });

  it("clears the filters when the form sends none", async () => {
    await expect(updateJobPosting({}, editForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ required_filters: [], optional_filters: [] }));
  });

  it("answers a filter error on its list and touches nothing", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `filter ${i}`);
    const result = await updateJobPosting({}, editForm({}, { requiredFilters: tooMany }));

    expect(result.fieldErrors).toEqual({ requiredFilters: ["Use at most 20 filters in all."] });
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("shows an edit of a published job on the job board at once, and leaves the board alone for a draft", async () => {
    updateSelect.mockResolvedValue({ data: [{ id: JOB_ID, published_at: "2026-11-09T10:00:00.000Z" }], error: null });
    await expect(updateJobPosting({}, editForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(updateTag).toHaveBeenCalledExactlyOnceWith("jobs");

    updateTag.mockClear();
    updateSelect.mockResolvedValue({ data: [{ id: JOB_ID, published_at: null }], error: null });
    await expect(updateJobPosting({}, editForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("checks the job's applications again, after the response, when the filters change", async () => {
    currentFilters.mockResolvedValue({ data: { required_filters: ["Figma"], optional_filters: [] }, error: null });

    await expect(
      updateJobPosting({}, editForm({}, { requiredFilters: ["Figma", "English"], optionalFilters: [] })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(after).toHaveBeenCalledOnce();
    // Nothing is read yet: the task runs once the response is gone.
    expect(rescreenJob).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(rescreenJob).toHaveBeenCalledExactlyOnceWith(JOB_ID);
  });

  it("notices a filter that moved from one list to the other, and a change of spelling", async () => {
    currentFilters.mockResolvedValue({ data: { required_filters: ["Figma"], optional_filters: ["English"] }, error: null });
    await expect(
      updateJobPosting({}, editForm({}, { requiredFilters: ["Figma", "English"], optionalFilters: [] })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(after).toHaveBeenCalledTimes(1);

    currentFilters.mockResolvedValue({ data: { required_filters: ["figma"], optional_filters: [] }, error: null });
    await expect(updateJobPosting({}, editForm({}, { requiredFilters: ["Figma"] }))).rejects.toThrow("NEXT_REDIRECT");
    expect(after).toHaveBeenCalledTimes(2);
  });

  it("leaves the applications alone when the filters are the same, however they are ordered", async () => {
    currentFilters.mockResolvedValue({
      data: { required_filters: ["Figma", "English"], optional_filters: ["Mentoring"] },
      error: null,
    });

    await expect(
      updateJobPosting({}, editForm({}, { requiredFilters: ["English", "Figma"], optionalFilters: ["Mentoring"] })),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(after).not.toHaveBeenCalled();
  });

  it("does not check anything again for a job it can't find or can't save", async () => {
    currentFilters.mockResolvedValue({ data: { required_filters: [], optional_filters: [] }, error: null });

    updateSelect.mockResolvedValue({ data: [], error: null });
    await updateJobPosting({}, editForm({}, { requiredFilters: ["Figma"] }));
    updateSelect.mockResolvedValue({ data: null, error: { message: "boom" } });
    await updateJobPosting({}, editForm({}, { requiredFilters: ["Figma"] }));

    expect(after).not.toHaveBeenCalled();
  });

  it("says the job wasn't found when row level security updates nothing", async () => {
    updateSelect.mockResolvedValue({ data: [], error: null });

    expect(await updateJobPosting({}, editForm())).toEqual({ error: "Job not found." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("reports a database error without redirecting", async () => {
    updateSelect.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await updateJobPosting({}, editForm())).toEqual({ error: "Could not save the changes. Try again." });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("publishJobPosting", () => {
  it("refuses an id that isn't a uuid, before anything else runs", async () => {
    for (const jobId of ["", "1", "not-a-uuid", `${JOB_ID}; drop table job_postings`]) {
      expect(await publishJobPosting(jobId), jobId).toEqual({ ok: false, error: "Invalid request." });
    }
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(publishJobPosting(JOB_ID)).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(rpc).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("publishes through the RPC, puts the job on the job board and refreshes the dashboard", async () => {
    expect(await publishJobPosting(JOB_ID)).toEqual({ ok: true });

    expect(rpc).toHaveBeenCalledExactlyOnceWith("publish_job_posting", { p_job_id: JOB_ID });
    expect(updateTag).toHaveBeenCalledExactlyOnceWith("jobs");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("is limited to 30 a minute per employer", async () => {
    await publishJobPosting(JOB_ID);
    expect(hit).toHaveBeenCalledWith("publish-job:user-1", 60_000);

    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });
    rpc.mockClear();
    refresh.mockClear();
    expect(await publishJobPosting(JOB_ID)).toEqual({
      ok: false,
      error: "Too many changes. Try again in a minute.",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says the job wasn't found when the RPC doesn't find it for this employer", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "Job not found" } });

    expect(await publishJobPosting(JOB_ID)).toEqual({ ok: false, error: "Job not found." });
    expect(refresh).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("gives a generic message for any other database error", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "The demo job stays private" } });

    expect(await publishJobPosting(JOB_ID)).toEqual({ ok: false, error: "Could not save. Try again." });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("unpublishJobPosting", () => {
  it("refuses bad input before anything else runs", async () => {
    const bad = [
      { jobId: "not-a-uuid", applicants: "keep" },
      { jobId: JOB_ID, applicants: "delete" },
      { jobId: JOB_ID, applicants: "move" },
      { jobId: JOB_ID, applicants: "move", targetJobId: JOB_ID },
      { jobId: JOB_ID, applicants: "move", targetJobId: "not-a-uuid" },
    ] as unknown as Parameters<typeof unpublishJobPosting>[0][];

    for (const input of bad) {
      expect(await unpublishJobPosting(input), JSON.stringify(input)).toEqual({
        ok: false,
        error: "Invalid request.",
      });
    }
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(unpublishJobPosting({ jobId: JOB_ID, applicants: "keep" })).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes keep and withdraw without a target, even if one was sent", async () => {
    expect(await unpublishJobPosting({ jobId: JOB_ID, applicants: "keep" })).toEqual({ ok: true });
    expect(rpc).toHaveBeenLastCalledWith("unpublish_job_posting", {
      p_job_id: JOB_ID,
      p_applicants: "keep",
      p_target_job_id: null,
    });

    expect(await unpublishJobPosting({ jobId: JOB_ID, applicants: "withdraw", targetJobId: OTHER_JOB_ID })).toEqual({
      ok: true,
    });
    expect(rpc).toHaveBeenLastCalledWith("unpublish_job_posting", {
      p_job_id: JOB_ID,
      p_applicants: "withdraw",
      p_target_job_id: null,
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("passes the target for a move", async () => {
    expect(await unpublishJobPosting({ jobId: JOB_ID, applicants: "move", targetJobId: OTHER_JOB_ID })).toEqual({
      ok: true,
    });

    expect(rpc).toHaveBeenCalledExactlyOnceWith("unpublish_job_posting", {
      p_job_id: JOB_ID,
      p_applicants: "move",
      p_target_job_id: OTHER_JOB_ID,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("checks the moved applications again for the job they moved to, after the response", async () => {
    await unpublishJobPosting({ jobId: JOB_ID, applicants: "move", targetJobId: OTHER_JOB_ID });

    expect(after).toHaveBeenCalledTimes(2);
    await after.mock.calls[0][0]();
    expect(rescreenJob).toHaveBeenCalledExactlyOnceWith(OTHER_JOB_ID);
    // A move can drop or withdraw an application, which lets its cover letter go.
    expect(after.mock.calls[1][0]).toBe(drainStorageDeletions);
  });

  it("checks nothing again when the applicants stay or are withdrawn", async () => {
    await unpublishJobPosting({ jobId: JOB_ID, applicants: "keep" });
    await unpublishJobPosting({ jobId: JOB_ID, applicants: "withdraw" });
    expect(rescreenJob).not.toHaveBeenCalled();
    for (const [task] of after.mock.calls) expect(task).toBe(drainStorageDeletions);
  });

  it("deletes the documents withdrawn applications gave up, after the response, and none for a pause", async () => {
    await unpublishJobPosting({ jobId: JOB_ID, applicants: "keep" });
    expect(after).not.toHaveBeenCalled();

    await unpublishJobPosting({ jobId: JOB_ID, applicants: "withdraw" });
    expect(after).toHaveBeenCalledExactlyOnceWith(drainStorageDeletions);
  });

  it("does not check anything again when a move fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Choose another" } });
    await unpublishJobPosting({ jobId: JOB_ID, applicants: "move", targetJobId: OTHER_JOB_ID });
    expect(after).not.toHaveBeenCalled();
  });

  it("takes the job off the job board at once", async () => {
    await unpublishJobPosting({ jobId: JOB_ID, applicants: "keep" });
    expect(updateTag).toHaveBeenCalledExactlyOnceWith("jobs");
  });

  it("shares the publish limit, 30 a minute", async () => {
    await unpublishJobPosting({ jobId: JOB_ID, applicants: "keep" });
    expect(hit).toHaveBeenCalledWith("publish-job:user-1", 60_000);

    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });
    rpc.mockClear();
    expect(await unpublishJobPosting({ jobId: JOB_ID, applicants: "keep" })).toEqual({
      ok: false,
      error: "Too many changes. Try again in a minute.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("explains an unpublished job and a bad target, and does not refresh", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "This job is not published" } });
    expect(await unpublishJobPosting({ jobId: JOB_ID, applicants: "keep" })).toEqual({
      ok: false,
      error: "This job is already unpublished.",
    });

    rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "Choose another of your jobs" } });
    expect(
      await unpublishJobPosting({ jobId: JOB_ID, applicants: "move", targetJobId: OTHER_JOB_ID }),
    ).toEqual({ ok: false, error: "Choose another of your jobs to move the applicants to." });

    rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "Job not found" } });
    expect(await unpublishJobPosting({ jobId: JOB_ID, applicants: "withdraw" })).toEqual({
      ok: false,
      error: "Job not found.",
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});

const APPLICATION_ID = "3d6f8a2b-1c4e-4f7a-9b2d-5e8c1a3f6b9d";

describe("the review marks", () => {
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  it("refuse an id that isn't a uuid, before anything else runs", async () => {
    for (const id of ["", "1", "not-a-uuid", `${APPLICATION_ID}; drop table job_applications`]) {
      expect(await markApplicationViewed(id), id).toEqual({ ok: false, error: "Invalid request." });
      expect(await setApplicationLiked(id, true), id).toEqual({ ok: false, error: "Invalid request." });
    }
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("refuse a liked value that isn't a boolean", async () => {
    expect(await setApplicationLiked(APPLICATION_ID, "yes" as unknown as boolean)).toEqual({
      ok: false,
      error: "Invalid request.",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("need an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(markApplicationViewed(APPLICATION_ID)).rejects.toBe(redirected);
    await expect(setApplicationLiked(APPLICATION_ID, true)).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(update).not.toHaveBeenCalled();
  });

  it("mark an application viewed: only viewed_at, on that application, without a refresh", async () => {
    expect(await markApplicationViewed(APPLICATION_ID)).toEqual({ ok: true });

    expect(from).toHaveBeenCalledWith("job_applications");
    expect(update).toHaveBeenCalledOnce();
    const [values] = update.mock.calls[0];
    expect(Object.keys(values)).toEqual(["viewed_at"]);
    expect(values.viewed_at).toMatch(ISO);
    expect(updateEq).toHaveBeenCalledExactlyOnceWith("id", APPLICATION_ID);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("like and unlike an application: only liked_at", async () => {
    expect(await setApplicationLiked(APPLICATION_ID, true)).toEqual({ ok: true });
    const [liked] = update.mock.calls[0];
    expect(Object.keys(liked)).toEqual(["liked_at"]);
    expect(liked.liked_at).toMatch(ISO);

    expect(await setApplicationLiked(APPLICATION_ID, false)).toEqual({ ok: true });
    expect(update).toHaveBeenLastCalledWith({ liked_at: null });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("say the application wasn't found when row level security updates nothing", async () => {
    updateSelect.mockResolvedValue({ data: [], error: null });

    expect(await markApplicationViewed(APPLICATION_ID)).toEqual({ ok: false, error: "Application not found." });
    expect(await setApplicationLiked(APPLICATION_ID, true)).toEqual({ ok: false, error: "Application not found." });
  });

  it("report a database error", async () => {
    updateSelect.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await markApplicationViewed(APPLICATION_ID)).toEqual({ ok: false, error: "Could not save. Try again." });
  });

  it("share one limit, 120 a minute per employer", async () => {
    await markApplicationViewed(APPLICATION_ID);
    await setApplicationLiked(APPLICATION_ID, true);
    expect(hit).toHaveBeenNthCalledWith(1, "review-mark:user-1", 60_000);
    expect(hit).toHaveBeenNthCalledWith(2, "review-mark:user-1", 60_000);

    hit.mockResolvedValue({ count: 120, resetAt: Date.now() + 60_000 });
    expect(await markApplicationViewed(APPLICATION_ID)).toEqual({ ok: true });

    hit.mockResolvedValue({ count: 121, resetAt: Date.now() + 60_000 });
    update.mockClear();
    expect(await setApplicationLiked(APPLICATION_ID, true)).toEqual({
      ok: false,
      error: "Too many changes. Try again in a minute.",
    });
    expect(update).not.toHaveBeenCalled();
  });
});

const STEP_ID = "22222222-2222-4222-8222-222222222222";
const STEP_CHOICE = { stage: "STEP", stepId: STEP_ID } as const;
const REJECTED_CHOICE = { stage: "REJECTED", stepId: null } as const;
const APPLIED_CHOICE = { stage: "APPLIED", stepId: null } as const;

describe("setApplicationStage", () => {
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  it("refuses an unknown status, a step without an id and an id without a step, before anything else runs", async () => {
    const refused = [
      { stage: "HIRED", stepId: null },
      { stage: "rejected", stepId: null },
      { stage: "STEP", stepId: null },
      { stage: "OFFER", stepId: STEP_ID },
      { stage: "STEP", stepId: "not-a-uuid" },
      { stage: "STEP" },
      "REJECTED",
      null,
      1,
    ];
    for (const choice of refused) {
      expect(await setApplicationStage(APPLICATION_ID, choice as never), JSON.stringify(choice)).toEqual({
        ok: false,
        error: "Invalid request.",
      });
    }
    expect(await setApplicationStage("not-a-uuid", REJECTED_CHOICE)).toEqual({ ok: false, error: "Invalid request." });
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(setApplicationStage(APPLICATION_ID, STEP_CHOICE)).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(update).not.toHaveBeenCalled();
  });

  it("writes only the status, its step and when it changed, on that application, without a refresh", async () => {
    expect(await setApplicationStage(APPLICATION_ID, STEP_CHOICE)).toEqual({ ok: true });

    expect(from).toHaveBeenCalledWith("job_applications");
    const [values] = update.mock.calls[0];
    expect(Object.keys(values).sort()).toEqual(["pipeline_stage", "stage_changed_at", "step_id"]);
    expect(values.pipeline_stage).toBe("STEP");
    expect(values.step_id).toBe(STEP_ID);
    expect(values.stage_changed_at).toMatch(ISO);
    expect(updateEq).toHaveBeenCalledExactlyOnceWith("id", APPLICATION_ID);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("never touches what the candidate sees", async () => {
    await setApplicationStage(APPLICATION_ID, STEP_CHOICE);

    const [values] = update.mock.calls[0];
    expect(Object.keys(values).some((column) => column.startsWith("candidate_"))).toBe(false);
  });

  it("clears the step when the status isn't one", async () => {
    expect(await setApplicationStage(APPLICATION_ID, REJECTED_CHOICE)).toEqual({ ok: true });
    expect(update.mock.calls[0][0]).toMatchObject({ pipeline_stage: "REJECTED", step_id: null });
  });

  it("can go back to any status", async () => {
    expect(await setApplicationStage(APPLICATION_ID, REJECTED_CHOICE)).toEqual({ ok: true });
    expect(await setApplicationStage(APPLICATION_ID, APPLIED_CHOICE)).toEqual({ ok: true });
    expect(update.mock.calls[1][0].pipeline_stage).toBe("APPLIED");
  });

  it("says the application wasn't found when row level security updates nothing", async () => {
    updateSelect.mockResolvedValue({ data: [], error: null });

    expect(await setApplicationStage(APPLICATION_ID, STEP_CHOICE)).toEqual({ ok: false, error: "Application not found." });
  });

  it("reports a database error, such as a step that isn't the company's", async () => {
    updateSelect.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await setApplicationStage(APPLICATION_ID, STEP_CHOICE)).toEqual({
      ok: false,
      error: "Could not save. Try again.",
    });
  });

  it("shares the review marks' limit", async () => {
    await setApplicationStage(APPLICATION_ID, STEP_CHOICE);
    expect(hit).toHaveBeenCalledWith("review-mark:user-1", 60_000);

    hit.mockResolvedValue({ count: 121, resetAt: Date.now() + 60_000 });
    update.mockClear();
    expect(await setApplicationStage(APPLICATION_ID, { stage: "OFFER", stepId: null })).toEqual({
      ok: false,
      error: "Too many changes. Try again in a minute.",
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("applyApplicationStages", () => {
  const change = { id: APPLICATION_ID, stage: "STEP", stepId: STEP_ID } as const;

  it("refuses a bad job id, no changes, a malformed change and too many, before anything else runs", async () => {
    const tooMany = Array.from({ length: 501 }, () => change);
    const refused: [string, unknown[]][] = [
      ["not-a-uuid", [change]],
      [JOB_ID, []],
      [JOB_ID, [{ id: "not-a-uuid", stage: "OFFER", stepId: null }]],
      [JOB_ID, [{ id: APPLICATION_ID, stage: "STEP", stepId: null }]],
      [JOB_ID, [{ id: APPLICATION_ID, stage: "HIRED", stepId: null }]],
      [JOB_ID, tooMany],
    ];
    for (const [jobId, changes] of refused) {
      expect(await applyApplicationStages(jobId, changes as never), `${jobId} ${changes.length}`).toEqual({
        ok: false,
        error: "Invalid request.",
      });
    }
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(applyApplicationStages(JOB_ID, [change])).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends what the confirmation listed to the database, and answers the ids it applied", async () => {
    rpc.mockResolvedValue({ data: [APPLICATION_ID], error: null });

    expect(await applyApplicationStages(JOB_ID, [change])).toEqual({ ok: true, appliedIds: [APPLICATION_ID] });

    expect(rpc).toHaveBeenCalledExactlyOnceWith("apply_application_stages", {
      p_job_id: JOB_ID,
      p_changes: [{ id: APPLICATION_ID, stage: "STEP", step_id: STEP_ID }],
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers no ids when the database applied nothing", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    expect(await applyApplicationStages(JOB_ID, [change])).toEqual({ ok: true, appliedIds: [] });
  });

  it("reports a database error without its detail", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "secret detail" } });

    const result = await applyApplicationStages(JOB_ID, [change]);
    expect(result).toEqual({ ok: false, error: "Could not apply the statuses. Try again." });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("is limited to 30 a minute", async () => {
    await applyApplicationStages(JOB_ID, [change]);
    expect(hit).toHaveBeenCalledWith("apply-stages:user-1", 60_000);

    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });
    rpc.mockClear();
    expect(await applyApplicationStages(JOB_ID, [change])).toEqual({
      ok: false,
      error: "Too many changes. Try again in a minute.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
