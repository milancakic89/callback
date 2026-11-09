import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccountType, hit, refresh, rpc, from, upsert, insert, single, maybeSingle, jobFilters, accountCv, cvEq, screenCv, put, get, remove } =
  vi.hoisted(() => {
    const single = vi.fn();
    const maybeSingle = vi.fn();
    const jobFilters = vi.fn();
    const accountCv = vi.fn();
    // The CV is looked up by id and by owner: .select().eq("id", …).eq("user_id", …).maybeSingle().
    const cvEq = vi.fn((): unknown => ({ eq: cvEq, maybeSingle: accountCv }));
    const upsert = vi.fn();
    const insert = vi.fn(() => ({ select: () => ({ single }) }));
    const selectExisting = () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) });
    return {
      requireAccountType: vi.fn(),
      hit: vi.fn(),
      refresh: vi.fn(),
      rpc: vi.fn(),
      from: vi.fn((table: string) => {
        if (table === "candidate_profiles") return { upsert };
        if (table === "job_postings") return { select: () => ({ eq: () => ({ maybeSingle: jobFilters }) }) };
        if (table === "candidate_cvs") return { select: () => ({ eq: cvEq }) };
        return { select: selectExisting, insert };
      }),
      upsert,
      insert,
      single,
      maybeSingle,
      jobFilters,
      accountCv,
      cvEq,
      screenCv: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
    };
  });

vi.mock("next/cache", () => ({ refresh }));
vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { rpc, from } }));
vi.mock("@/lib/storage/documents", () => ({ documentStore: { put, get, delete: remove } }));
vi.mock("@/lib/screening", () => ({ screenCv }));

import { applyToJob } from "./actions";

const JOB_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";
const CV_ID = "3d6f8a1c-2b4e-4c5d-9e7f-1a2b3c4d5e6f";
const CV_KEY = `candidates/user-1/cvs/${CV_ID}/Ana Novak CV.pdf`;
const APPLIED_AT = "2026-11-09T10:00:00.000Z";
const FAILURE = "Could not send your application. Try again.";
const CV_GONE = "That CV is no longer on your account.";

const pdf = (name: string, body = "%PDF-1.7 hello") => new File([body], name, { type: "application/pdf" });
const stream = (text: string) => new Response(text).body;

function form(overrides: Record<string, string | File | null> = {}) {
  const data = new FormData();
  const fields: Record<string, string | File | null> = {
    jobId: JOB_ID,
    cvId: CV_ID,
    fullName: "  Ana Novak  ",
    location: "Belgrade, Serbia",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) if (value !== null) data.set(key, value);
  return data;
}

const insertedRow = () => (insert.mock.calls[0] as unknown as [Record<string, unknown>])[0];

beforeEach(() => {
  vi.clearAllMocks();
  requireAccountType.mockResolvedValue({ id: "user-1", email: "ana@example.com", accountType: "candidate", companySlug: null });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  rpc.mockResolvedValue({ data: [{ id: JOB_ID }], error: null });
  maybeSingle.mockResolvedValue({ data: null, error: null });
  accountCv.mockResolvedValue({ data: { storage_key: CV_KEY, file_name: "Ana Novak CV.pdf" }, error: null });
  upsert.mockResolvedValue({ error: null });
  put.mockResolvedValue(undefined);
  get.mockImplementation(async () => stream("%PDF-1.7 the cv"));
  remove.mockResolvedValue(undefined);
  single.mockResolvedValue({ data: { applied_at: APPLIED_AT }, error: null });
  jobFilters.mockResolvedValue({ data: { required_filters: ["Figma"], optional_filters: ["Mentoring"] }, error: null });
  screenCv.mockResolvedValue(null);
});

function touchedNothing() {
  expect(requireAccountType).not.toHaveBeenCalled();
  expect(hit).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
}

describe("applyToJob: bad input", () => {
  it("answers the field errors and touches nothing", async () => {
    const bad: [string, Record<string, string | File | null>, string][] = [
      ["a job id that isn't a uuid", { jobId: "nope" }, "jobId"],
      ["no CV chosen", { cvId: null }, "cvId"],
      ["a CV id that isn't a uuid", { cvId: "candidates/user-2/cvs/x/cv.pdf" }, "cvId"],
      ["no name", { fullName: "   " }, "fullName"],
      ["a name over 100 characters", { fullName: "x".repeat(101) }, "fullName"],
      ["a location over 100 characters", { location: "x".repeat(101) }, "location"],
      ["a written cover letter over 5,000 characters", { coverLetterText: "x".repeat(5001) }, "coverLetterText"],
      ["a cover letter that is not a PDF", { coverLetter: new File(["MZ binary"], "letter.pdf", { type: "application/pdf" }) }, "coverLetter"],
      ["an empty cover letter that was chosen", { coverLetter: pdf("letter.pdf", "") }, "coverLetter"],
      ["a written and a PDF cover letter", { coverLetterText: "Dear team", coverLetter: pdf("letter.pdf") }, "coverLetter"],
    ];
    for (const [label, overrides, field] of bad) {
      const result = await applyToJob({}, form(overrides));
      expect(result.fieldErrors?.[field], label).toBeDefined();
      expect(result.appliedAt, label).toBeUndefined();
    }
    touchedNothing();
  });

  it("says why", async () => {
    expect((await applyToJob({}, form({ cvId: null }))).fieldErrors?.cvId).toEqual(["Choose a CV."]);
    expect((await applyToJob({}, form({ coverLetterText: "Hi", coverLetter: pdf("l.pdf") }))).fieldErrors?.coverLetter).toEqual([
      "Send a written cover letter or a PDF, not both.",
    ]);
    expect((await applyToJob({}, form({ coverLetter: new File(["hello"], "l.pdf") }))).fieldErrors?.coverLetter).toEqual([
      "Only PDF files are accepted.",
    ]);
  });

  it("refuses a cover letter over 5 MB and takes one of exactly 5 MB", async () => {
    const fiveMb = 5 * 1024 * 1024;
    const file = (size: number) => new File([new Uint8Array(size).fill(0).map((_, i) => "%PDF-".charCodeAt(i) || 0)], "big.pdf");

    const refused = await applyToJob({}, form({ coverLetter: file(fiveMb + 1) }));
    expect(refused.fieldErrors?.coverLetter).toEqual(["That file is larger than 5 MB."]);
    touchedNothing();

    expect((await applyToJob({}, form({ coverLetter: file(fiveMb) }))).appliedAt).toBe(APPLIED_AT);
  });
});

describe("applyToJob: who and how often", () => {
  it("is for candidates: requireAccountType runs before the limit, the job and the files", async () => {
    requireAccountType.mockRejectedValue(new Error("NEXT_REDIRECT:/acme"));

    await expect(applyToJob({}, form())).rejects.toThrow("NEXT_REDIRECT:/acme");
    expect(requireAccountType).toHaveBeenCalledExactlyOnceWith("candidate");
    expect(hit).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("allows 10 an hour per candidate, and stops there", async () => {
    hit.mockResolvedValue({ count: 11, resetAt: Date.now() + 60_000 });

    expect(await applyToJob({}, form())).toEqual({ error: "You've sent a lot of applications. Try again in an hour." });
    expect(hit).toHaveBeenCalledExactlyOnceWith("apply:user-1", 60 * 60_000);
    expect(rpc).not.toHaveBeenCalled();

    hit.mockResolvedValue({ count: 10, resetAt: Date.now() + 60_000 });
    expect((await applyToJob({}, form())).appliedAt).toBe(APPLIED_AT);
  });
});

describe("applyToJob: the job", () => {
  it("looks the job up the way the job board does, so an unpublished, a demo or an unknown job is refused", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    expect(await applyToJob({}, form())).toEqual({ error: "This job is no longer accepting applications." });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("published_job_postings", { p_job_id: JOB_ID });
    expect(upsert).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a second application before anything is saved or uploaded", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "existing" }, error: null });

    expect(await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }))).toEqual({ error: "You have already applied to this job." });
    expect(upsert).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers a generic error, saving nothing, when the database can't be asked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    expect(await applyToJob({}, form())).toEqual({ error: FAILURE });

    rpc.mockResolvedValue({ data: [{ id: JOB_ID }], error: null });
    maybeSingle.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await applyToJob({}, form())).toEqual({ error: FAILURE });

    expect(put).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("applyToJob: the CV", () => {
  it("is looked up by its id and by the caller, with the secret key", async () => {
    await applyToJob({}, form());

    expect(from).toHaveBeenCalledWith("candidate_cvs");
    expect(cvEq).toHaveBeenCalledWith("id", CV_ID);
    expect(cvEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("refuses another candidate's CV, or one that was deleted, before anything is saved", async () => {
    accountCv.mockResolvedValue({ data: null, error: null });

    expect(await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }))).toEqual({ error: CV_GONE });
    expect(upsert).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers a generic error when the CV can't be looked up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    accountCv.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });

    expect(await applyToJob({}, form())).toEqual({ error: FAILURE });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("applyToJob: a good application", () => {
  it("saves the profile, points to the CV on the account, uploads nothing without a letter, and refreshes", async () => {
    const result = await applyToJob({}, form());

    expect(result).toEqual({ appliedAt: APPLIED_AT });
    expect(upsert).toHaveBeenCalledExactlyOnceWith(
      { user_id: "user-1", full_name: "Ana Novak", location: "Belgrade, Serbia" },
      { onConflict: "user_id" },
    );
    expect(insertedRow()).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      job_posting_id: JOB_ID,
      candidate_id: "user-1",
      cv_id: CV_ID,
      cv_path: CV_KEY,
      cover_letter_path: null,
      cover_letter_text: null,
    });
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("stores a written cover letter, trimmed, and uploads nothing", async () => {
    await applyToJob({}, form({ coverLetterText: "  Dear team,\n\nI would love to join.  " }));

    expect(insertedRow()).toMatchObject({ cover_letter_text: "Dear team,\n\nI would love to join.", cover_letter_path: null });
    expect(put).not.toHaveBeenCalled();
  });

  it("uploads a PDF cover letter under the application, with a path made on the server", async () => {
    await applyToJob({}, form({ coverLetter: pdf("../My Letter.pdf") }));

    const row = insertedRow();
    expect(row.cover_letter_path).toBe(`applications/${row.id}/cover-letter/My Letter.pdf`);
    expect(row.cover_letter_text).toBeNull();
    expect(put).toHaveBeenCalledExactlyOnceWith(row.cover_letter_path, expect.any(Uint8Array), "application/pdf");
    expect(new TextDecoder().decode(put.mock.calls[0][1])).toBe("%PDF-1.7 hello");
  });

  it("takes an empty location and an empty written letter as none", async () => {
    await applyToJob({}, form({ location: "  ", coverLetterText: "   " }));

    expect(upsert.mock.calls[0][0]).toMatchObject({ location: null });
    expect(insertedRow().cover_letter_text).toBeNull();
  });

  it("does the steps in order: profile, letter, screening, application, refresh", async () => {
    const order: string[] = [];
    upsert.mockImplementation(async () => (order.push("profile"), { error: null }));
    put.mockImplementation(async () => void order.push("letter"));
    screenCv.mockImplementation(async () => (order.push("screening"), null));
    insert.mockImplementationOnce((() => (order.push("application"), { select: () => ({ single }) })) as never);
    refresh.mockImplementation(() => void order.push("refresh"));

    await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }));
    expect(order).toEqual(["profile", "letter", "screening", "application", "refresh"]);
  });

  it("ignores paths, a candidate id or an application id sent in the form", async () => {
    await applyToJob(
      {},
      form({ cv_path: "mock/ana-novak/cv.pdf", candidate_id: "someone-else", id: "11111111-1111-4111-8111-111111111111", cover_letter_path: "x" }),
    );

    const row = insertedRow();
    expect(row.candidate_id).toBe("user-1");
    expect(row.id).not.toBe("11111111-1111-4111-8111-111111111111");
    expect(row.cv_path).toBe(CV_KEY);
    expect(Object.keys(row).sort()).toEqual([
      "candidate_id",
      "cover_letter_path",
      "cover_letter_text",
      "cv_id",
      "cv_path",
      "id",
      "job_posting_id",
    ]);
  });
});

const SCREENING = {
  matched_filters: ["Figma"],
  unverified_filters: [] as string[],
  screening_outcome: "checked" as const,
  screened_at: "2026-11-09T10:00:00.000Z",
  screening_engine: "keywords-v1",
};

describe("applyToJob: the CV is checked against the job's filters", () => {
  it("reads the job's filters, reads the CV from R2 and screens it, and stores the result with the application", async () => {
    screenCv.mockResolvedValue(SCREENING);

    const result = await applyToJob({}, form());

    expect(from).toHaveBeenCalledWith("job_postings");
    expect(get).toHaveBeenCalledExactlyOnceWith(CV_KEY);
    const [cv, filters] = screenCv.mock.calls[0] as unknown as [{ bytes: Uint8Array; fileName: string }, { required: string[]; optional: string[] }];
    expect(filters).toEqual({ required: ["Figma"], optional: ["Mentoring"] });
    expect(cv.fileName).toBe("Ana Novak CV.pdf");
    expect(new TextDecoder().decode(cv.bytes)).toBe("%PDF-1.7 the cv");

    expect(insertedRow()).toMatchObject(SCREENING);
    // The result is the screening's, and never reaches the candidate.
    expect(result).toEqual({ appliedAt: APPLIED_AT });
    expect(JSON.stringify(result)).not.toMatch(/Figma|Mentoring|filter|matched/i);
  });

  it("doesn't read the CV when the job has no filters", async () => {
    jobFilters.mockResolvedValue({ data: { required_filters: [], optional_filters: [] }, error: null });

    expect((await applyToJob({}, form())).appliedAt).toBe(APPLIED_AT);
    expect(get).not.toHaveBeenCalled();
    expect(screenCv).not.toHaveBeenCalled();
    expect(insertedRow()).not.toHaveProperty("matched_filters");
  });

  it("still makes the application when the filters, or the CV, can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    jobFilters.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    expect((await applyToJob({}, form())).appliedAt).toBe(APPLIED_AT);

    get.mockResolvedValueOnce(null);
    expect((await applyToJob({}, form())).appliedAt).toBe(APPLIED_AT);

    get.mockRejectedValueOnce(new Error("R2 get failed: 503"));
    expect((await applyToJob({}, form())).appliedAt).toBe(APPLIED_AT);

    expect(screenCv).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(3);
    for (const call of insert.mock.calls as unknown as [Record<string, unknown>][]) expect(call[0]).not.toHaveProperty("matched_filters");
  });

  it("does not screen an application that is refused", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await applyToJob({}, form());

    rpc.mockResolvedValue({ data: [{ id: JOB_ID }], error: null });
    accountCv.mockResolvedValue({ data: null, error: null });
    await applyToJob({}, form());

    expect(get).not.toHaveBeenCalled();
    expect(screenCv).not.toHaveBeenCalled();
  });
});

describe("applyToJob: when something fails halfway", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("deletes the uploaded cover letter when the insert fails, and never the CV", async () => {
    single.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });

    expect(await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }))).toEqual({ error: FAILURE });
    expect(remove).toHaveBeenCalledExactlyOnceWith(put.mock.calls[0][0]);
    expect(remove).not.toHaveBeenCalledWith(CV_KEY);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers 'already applied' when another request got in first (23505)", async () => {
    single.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });

    expect(await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }))).toEqual({ error: "You have already applied to this job." });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("answers that the CV is gone when it was deleted in the meantime (23503)", async () => {
    single.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });

    expect(await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }))).toEqual({ error: CV_GONE });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("inserts nothing when the cover letter can't be uploaded", async () => {
    put.mockRejectedValue(new Error("R2 put failed: 503"));

    expect(await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }))).toEqual({ error: FAILURE });
    expect(remove).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("still answers the application's error when the cleanup delete fails too", async () => {
    single.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    remove.mockRejectedValue(new Error("R2 delete failed: 503"));

    expect(await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }))).toEqual({ error: FAILURE });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("answers an error and uploads nothing when the profile can't be saved", async () => {
    upsert.mockResolvedValue({ error: { code: "XX000", message: "boom" } });

    expect(await applyToJob({}, form({ coverLetter: pdf("letter.pdf") }))).toEqual({ error: FAILURE });
    expect(put).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
