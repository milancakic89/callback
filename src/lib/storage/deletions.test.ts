import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, limit, dequeue, remove } = vi.hoisted(() => {
  const limit = vi.fn();
  const dequeue = vi.fn();
  return {
    from: vi.fn(() => ({
      select: () => ({ order: () => ({ limit: (n: number) => ({ returns: () => limit(n) }) }) }),
      delete: () => ({ in: dequeue }),
    })),
    limit,
    dequeue,
    remove: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from } }));
vi.mock("./documents", () => ({ documentStore: { delete: remove } }));

import { drainStorageDeletions } from "./deletions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  limit.mockResolvedValue({ data: [{ key: "applications/a/cover-letter/l.pdf" }, { key: "candidates/u/cvs/c/cv.pdf" }], error: null });
  dequeue.mockResolvedValue({ error: null });
  remove.mockResolvedValue(undefined);
});

describe("drainStorageDeletions", () => {
  it("deletes up to 100 queued files from R2, then takes them off the queue", async () => {
    await drainStorageDeletions();

    expect(limit).toHaveBeenCalledWith(100);
    expect(remove.mock.calls.map((call) => call[0])).toEqual(["applications/a/cover-letter/l.pdf", "candidates/u/cvs/c/cv.pdf"]);
    expect(dequeue).toHaveBeenCalledExactlyOnceWith("key", ["applications/a/cover-letter/l.pdf", "candidates/u/cvs/c/cv.pdf"]);
  });

  it("keeps a file R2 couldn't delete on the queue, for the next drain", async () => {
    remove.mockRejectedValueOnce(new Error("R2 delete failed: 503"));

    await drainStorageDeletions();
    expect(dequeue).toHaveBeenCalledExactlyOnceWith("key", ["candidates/u/cvs/c/cv.pdf"]);
  });

  it("does nothing more when the queue is empty, every delete failed, or the queue can't be read", async () => {
    limit.mockResolvedValueOnce({ data: [], error: null });
    await drainStorageDeletions();

    remove.mockRejectedValue(new Error("R2 down"));
    await drainStorageDeletions();

    limit.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    await drainStorageDeletions();

    expect(dequeue).not.toHaveBeenCalled();
  });

  it("never throws, even when the queue can't be updated", async () => {
    dequeue.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    await expect(drainStorageDeletions()).resolves.toBeUndefined();
  });
});
