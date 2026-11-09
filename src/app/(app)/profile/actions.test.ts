import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccountType, hit, refresh, after, from, countEq, insert, single, deleteSelect, deleteEq, put, remove, getMyCvs } = vi.hoisted(() => {
  const single = vi.fn();
  const insert = vi.fn(() => ({ select: () => ({ single }) }));
  // .select("id", { count, head }).eq("user_id", …) answers the count.
  const countEq = vi.fn();
  // .delete().eq("id", …).eq("user_id", …).select("id").
  const deleteSelect = vi.fn();
  const deleteEq = vi.fn((): unknown => ({ eq: deleteEq, select: deleteSelect }));
  return {
    requireAccountType: vi.fn(),
    hit: vi.fn(),
    refresh: vi.fn(),
    after: vi.fn<(task: () => unknown) => void>(),
    from: vi.fn(() => ({ select: () => ({ eq: countEq }), insert, delete: () => ({ eq: deleteEq }) })),
    countEq,
    insert,
    single,
    deleteSelect,
    deleteEq,
    put: vi.fn(),
    remove: vi.fn(),
    getMyCvs: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/storage/documents", () => ({ documentStore: { put, delete: remove } }));
vi.mock("@/lib/storage/deletions", () => ({ drainStorageDeletions: "drain" }));
vi.mock("@/lib/cvs/queries", () => ({ getMyCvs }));

import { deleteCv, uploadCv } from "./actions";

const CV_ID = "3d6f8a1c-2b4e-4c5d-9e7f-1a2b3c4d5e6f";
const CREATED_AT = "2026-11-09T10:00:00.000Z";
const LIMIT = "You can keep up to 5 CVs. Delete one to add another.";

const pdf = (name: string, body = "%PDF-1.7 hello") => new File([body], name, { type: "application/pdf" });

function form(cv: File | null) {
  const data = new FormData();
  if (cv) data.set("cv", cv);
  return data;
}

const insertedRow = () => (insert.mock.calls[0] as unknown as [Record<string, unknown>])[0];

beforeEach(() => {
  vi.clearAllMocks();
  requireAccountType.mockResolvedValue({ id: "user-1", email: "ana@example.com", accountType: "candidate", companySlug: null });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  countEq.mockResolvedValue({ count: 2, error: null });
  single.mockResolvedValue({ data: { created_at: CREATED_AT }, error: null });
  deleteSelect.mockResolvedValue({ data: [{ id: CV_ID }], error: null });
  put.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  getMyCvs.mockResolvedValue([]);
});

describe("uploadCv", () => {
  it("refuses a missing file, an empty one, one that isn't a PDF and one over 5 MB, touching nothing", async () => {
    const fiveMb = 5 * 1024 * 1024;
    const big = new File([new Uint8Array(fiveMb + 1).map((_, i) => "%PDF-".charCodeAt(i) || 0)], "big.pdf");
    const cases: [File | null, string][] = [
      [null, "Choose your CV as a PDF."],
      [new File([], ""), "Choose your CV as a PDF."],
      [pdf("cv.pdf", ""), "That file is empty."],
      [new File(["GIF89a"], "cv.pdf", { type: "application/pdf" }), "Only PDF files are accepted."],
      [big, "That file is larger than 5 MB."],
    ];
    for (const [file, error] of cases) {
      expect(await uploadCv(form(file)), error).toEqual({ ok: false, error });
    }
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("is for candidates, within 20 uploads an hour", async () => {
    requireAccountType.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/acme"));
    await expect(uploadCv(form(pdf("cv.pdf")))).rejects.toThrow("NEXT_REDIRECT:/acme");
    expect(requireAccountType).toHaveBeenCalledWith("candidate");

    hit.mockResolvedValue({ count: 21, resetAt: Date.now() + 60_000 });
    expect(await uploadCv(form(pdf("cv.pdf")))).toEqual({ ok: false, error: "You've uploaded a lot of CVs. Try again in an hour." });
    expect(hit).toHaveBeenCalledWith("cv-upload:user-1", 60 * 60_000);
    expect(put).not.toHaveBeenCalled();
  });

  it("puts the file in R2 under the candidate, inserts the row with the secret key, and returns the new CV", async () => {
    const result = await uploadCv(form(pdf("../Ana Novak CV.pdf")));

    const row = insertedRow();
    expect(row).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      user_id: "user-1",
      file_name: "Ana Novak CV.pdf",
      storage_key: `candidates/user-1/cvs/${row.id}/Ana Novak CV.pdf`,
      size_bytes: 14,
    });
    expect(put).toHaveBeenCalledExactlyOnceWith(row.storage_key, expect.any(Uint8Array), "application/pdf");
    expect(result).toEqual({
      ok: true,
      cv: { id: row.id, fileName: "Ana Novak CV.pdf", sizeBytes: 14, createdAt: CREATED_AT, activeOn: [] },
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("answers the limit of 5 early, before anything is uploaded", async () => {
    countEq.mockResolvedValue({ count: 5, error: null });

    expect(await uploadCv(form(pdf("cv.pdf")))).toEqual({ ok: false, error: LIMIT });
    expect(countEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(put).not.toHaveBeenCalled();
  });

  it("answers the limit when the database refuses a 6th (54000), and deletes the file again", async () => {
    single.mockResolvedValue({ data: null, error: { code: "54000", message: "A candidate keeps at most 5 CVs" } });

    expect(await uploadCv(form(pdf("cv.pdf")))).toEqual({ ok: false, error: LIMIT });
    expect(remove).toHaveBeenCalledExactlyOnceWith(put.mock.calls[0][0]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("deletes the file when the insert fails, and answers a generic error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    single.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    remove.mockRejectedValue(new Error("R2 delete failed"));

    expect(await uploadCv(form(pdf("cv.pdf")))).toEqual({ ok: false, error: "Could not upload your CV. Try again." });
    expect(remove).toHaveBeenCalledOnce();
  });

  it("inserts nothing when R2 refuses the file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    put.mockRejectedValue(new Error("R2 put failed: 503"));

    expect(await uploadCv(form(pdf("cv.pdf")))).toEqual({ ok: false, error: "Could not upload your CV. Try again." });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("deleteCv", () => {
  it("refuses an id that isn't a uuid", async () => {
    expect(await deleteCv("candidates/user-2/cvs/x/cv.pdf")).toEqual({ ok: false, error: "Invalid request." });
    expect(requireAccountType).not.toHaveBeenCalled();
  });

  it("deletes by id and by owner, then deletes the file after the response", async () => {
    expect(await deleteCv(CV_ID)).toEqual({ ok: true });

    expect(requireAccountType).toHaveBeenCalledWith("candidate");
    expect(deleteEq).toHaveBeenCalledWith("id", CV_ID);
    expect(deleteEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(after).toHaveBeenCalledExactlyOnceWith("drain");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("says which jobs hold a CV the database won't delete (23503)", async () => {
    deleteSelect.mockResolvedValue({ data: null, error: { code: "23503", message: "violates foreign key constraint" } });
    getMyCvs.mockResolvedValue([{ id: CV_ID, fileName: "cv.pdf", sizeBytes: 1, createdAt: CREATED_AT, activeOn: ["Designer at Acme"] }]);

    expect(await deleteCv(CV_ID)).toEqual({
      ok: false,
      error:
        "This CV is on an active application for Designer at Acme. You can delete it once the company closes the job or you withdraw the application.",
    });
    expect(after).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("answers that the CV is gone when nothing was deleted (another candidate's, or already deleted)", async () => {
    deleteSelect.mockResolvedValue({ data: [], error: null });

    expect(await deleteCv(CV_ID)).toEqual({ ok: false, error: "That CV is no longer on your account." });
    expect(after).not.toHaveBeenCalled();
  });

  it("is limited to 30 a minute", async () => {
    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });

    expect(await deleteCv(CV_ID)).toEqual({ ok: false, error: "Too many changes. Try again in a minute." });
    expect(hit).toHaveBeenCalledWith("cv-delete:user-1", 60_000);
    expect(deleteEq).not.toHaveBeenCalled();
  });
});
