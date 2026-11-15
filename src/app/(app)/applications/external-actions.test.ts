import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccountType, hit, refresh, redirect, from, insert, update, remove, eqCalls, selectAfterWrite } = vi.hoisted(() => {
  const eqCalls: [string, string][] = [];
  const selectAfterWrite = vi.fn();
  // update(...).eq().eq().select() and delete().eq().eq().select(): the filters are recorded.
  const filters = { eq: (column: string, value: string) => (eqCalls.push([column, value]), filters), select: selectAfterWrite };
  const insert = vi.fn();
  const update = vi.fn(() => filters);
  const remove = vi.fn(() => filters);
  return {
    requireAccountType: vi.fn(),
    hit: vi.fn(),
    refresh: vi.fn(),
    redirect: vi.fn(),
    from: vi.fn(() => ({ insert, update, delete: remove })),
    insert,
    update,
    remove,
    eqCalls,
    selectAfterWrite,
  };
});

vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from, rpc: vi.fn() }) }));
vi.mock("@/lib/storage/deletions", () => ({ drainStorageDeletions: "drain" }));
vi.mock("@/lib/interviews/respond", () => ({ answerInvitation: vi.fn() }));

import { addExternalApplication, removeExternalApplication, setExternalApplicationStatus } from "./actions";

const ROW_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";
const CV_ID = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const JOB_URL = "https://www.linkedin.com/jobs/view/4463907148/";

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  const values = { url: JOB_URL, title: "Data Engineer", company: "Gamma", location: "Belgrade", cvId: CV_ID, status: "PENDING", ...fields };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  eqCalls.length = 0;
  requireAccountType.mockResolvedValue({ id: "user-1", email: "ana@example.com", accountType: "candidate", companySlug: null });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  insert.mockResolvedValue({ error: null });
  selectAfterWrite.mockResolvedValue({ data: [{ id: ROW_ID }], error: null });
  // The real redirect() throws to stop the action; so does this one.
  redirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

describe("addExternalApplication", () => {
  it("inserts the candidate's row with their own client, then sends them to the list", async () => {
    await expect(addExternalApplication({}, form())).rejects.toThrow("NEXT_REDIRECT:/applications");

    expect(requireAccountType).toHaveBeenCalledWith("candidate");
    expect(from).toHaveBeenCalledWith("external_applications");
    expect(insert).toHaveBeenCalledExactlyOnceWith({
      source: "linkedin",
      url: JOB_URL,
      title: "Data Engineer",
      company_name: "Gamma",
      location: "Belgrade",
      cv_id: CV_ID,
      status: "PENDING",
    });
  });

  it("never sends an owner: the row is the session's", async () => {
    await expect(addExternalApplication({}, form({ user_id: "someone-else" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(insert.mock.calls[0][0]).not.toHaveProperty("user_id");
  });

  it("takes the source from the address, and the canonical address, whatever the form says", async () => {
    const data = form({ url: "https://www.helloworld.rs/posao/Fullstack-Developer/Proximus-d.o.o/766944?utm=x#y", source: "linkedin" });
    await expect(addExternalApplication({}, data)).rejects.toThrow("NEXT_REDIRECT");

    expect(insert.mock.calls[0][0]).toMatchObject({
      source: "helloworld",
      url: "https://www.helloworld.rs/posao/Fullstack-Developer/Proximus-d.o.o/766944",
    });
  });

  it("saves a job with no CV and no location", async () => {
    await expect(addExternalApplication({}, form({ cvId: "", location: "" }))).rejects.toThrow("NEXT_REDIRECT");

    expect(insert.mock.calls[0][0]).toMatchObject({ cv_id: null, location: null });
  });

  it("refuses an address that isn't a job of the three sites, before anything else runs", async () => {
    for (const url of ["https://evil.rs/posao/a/b/1", "http://www.linkedin.com/jobs/view/4463907148/", "javascript:alert(1)"]) {
      expect(await addExternalApplication({}, form({ url })), url).toEqual({ error: "That link doesn't point to a job we can add." });
    }
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers a field's error under that field", async () => {
    const state = await addExternalApplication({}, form({ title: " ", status: "PENDING" }));

    expect(state).toEqual({ fieldErrors: { title: ["Enter the job title."] } });
    expect(insert).not.toHaveBeenCalled();
  });

  it("is limited to 30 an hour", async () => {
    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });

    expect(await addExternalApplication({}, form())).toEqual({ error: "Too many jobs added. Try again in an hour." });
    expect(hit).toHaveBeenCalledWith("external-application:user-1", 60 * 60_000);
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    ["23505", "Already in your applications."],
    ["23503", "That CV is no longer on your account."],
    ["54000", "You can keep up to 1,000 jobs from other sites. Remove one to add another."],
    ["23514", "That link doesn't point to a job we can add."],
  ])("says what is wrong when the database answers %s", async (code, message) => {
    insert.mockResolvedValue({ error: { code, message: "detail" } });

    expect(await addExternalApplication({}, form())).toEqual({ error: message });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("answers a generic error, and logs the detail, for anything else", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    insert.mockResolvedValue({ error: { code: "XX000", message: "secret detail" } });

    const state = await addExternalApplication({}, form());

    expect(state).toEqual({ error: "Could not save. Try again." });
    expect(JSON.stringify(state)).not.toContain("secret");
    expect(log).toHaveBeenCalled();
  });
});

describe("setExternalApplicationStatus", () => {
  it("refuses a bad id or status, before anything else runs", async () => {
    expect(await setExternalApplicationStatus("nope", "OFFER")).toEqual({ ok: false, error: "Invalid request." });
    expect(await setExternalApplicationStatus(ROW_ID, "DONE")).toEqual({ ok: false, error: "Invalid request." });
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("changes the status of the caller's own row, and only the status", async () => {
    expect(await setExternalApplicationStatus(ROW_ID, "OFFER")).toEqual({ ok: true });

    expect(requireAccountType).toHaveBeenCalledWith("candidate");
    expect(update).toHaveBeenCalledExactlyOnceWith({ status: "OFFER" });
    expect(eqCalls).toEqual([
      ["user_id", "user-1"],
      ["id", ROW_ID],
    ]);
  });

  it("says when there is no such row (another candidate's, or removed)", async () => {
    selectAfterWrite.mockResolvedValue({ data: [], error: null });

    expect(await setExternalApplicationStatus(ROW_ID, "OFFER")).toEqual({ ok: false, error: "Application not found." });
  });

  it("says it couldn't save when the database fails", async () => {
    selectAfterWrite.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });

    expect(await setExternalApplicationStatus(ROW_ID, "OFFER")).toEqual({ ok: false, error: "Could not save. Try again." });
  });

  it("is limited to 60 a minute", async () => {
    hit.mockResolvedValue({ count: 61, resetAt: Date.now() + 60_000 });

    expect(await setExternalApplicationStatus(ROW_ID, "OFFER")).toEqual({ ok: false, error: "Too many changes. Try again in a minute." });
    expect(hit).toHaveBeenCalledWith("external-application-status:user-1", 60_000);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("removeExternalApplication", () => {
  it("refuses an id that isn't a uuid, before anything else runs", async () => {
    expect(await removeExternalApplication("nope")).toEqual({ ok: false, error: "Invalid request." });
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes the caller's own row, and refreshes the list", async () => {
    expect(await removeExternalApplication(ROW_ID)).toEqual({ ok: true });

    expect(requireAccountType).toHaveBeenCalledWith("candidate");
    expect(from).toHaveBeenCalledWith("external_applications");
    expect(eqCalls).toEqual([
      ["user_id", "user-1"],
      ["id", ROW_ID],
    ]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says when there is no such row", async () => {
    selectAfterWrite.mockResolvedValue({ data: [], error: null });

    expect(await removeExternalApplication(ROW_ID)).toEqual({ ok: false, error: "Application not found." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says it couldn't remove when the database fails", async () => {
    selectAfterWrite.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });

    expect(await removeExternalApplication(ROW_ID)).toEqual({ ok: false, error: "Could not remove. Try again." });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is limited to 20 a minute", async () => {
    hit.mockResolvedValue({ count: 21, resetAt: Date.now() + 60_000 });

    expect(await removeExternalApplication(ROW_ID)).toEqual({ ok: false, error: "Too many changes. Try again in a minute." });
    expect(hit).toHaveBeenCalledWith("external-application-remove:user-1", 60_000);
    expect(remove).not.toHaveBeenCalled();
  });
});
