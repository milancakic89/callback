import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, hit, from, eq, maybeSingle, get: getObject } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn((): unknown => ({ eq, maybeSingle }));
  return {
    getCurrentUser: vi.fn(),
    hit: vi.fn(),
    from: vi.fn(() => ({ select: () => ({ eq }) })),
    eq,
    maybeSingle,
    get: vi.fn(),
  };
});

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/storage/documents", () => ({ documentStore: { get: getObject } }));

import { GET } from "./route";

const CV_ID = "3d6f8a1c-2b4e-4c5d-9e7f-1a2b3c4d5e6f";
const KEY = `candidates/user-1/cvs/${CV_ID}/Ana Novak CV.pdf`;

const open = (id = CV_ID) => GET(new Request(`https://callback.rs/api/cvs/${id}`), { params: Promise.resolve({ cvId: id }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user-1", email: "ana@example.com", accountType: "candidate" });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  maybeSingle.mockResolvedValue({ data: { storage_key: KEY, file_name: "Ana Novak CV.pdf" }, error: null });
  getObject.mockImplementation(async () => new Blob(["%PDF-1.7"]).stream());
});

describe("GET a CV on the candidate's account", () => {
  it("finds the CV by id and by owner, and streams it inline with its name, never cached", async () => {
    const response = await open();

    expect(response.status).toBe(200);
    expect(eq).toHaveBeenCalledWith("id", CV_ID);
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(getObject).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="Ana Novak CV.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("%PDF-1.7");
  });

  it("refuses a bad id, a guest and an employer", async () => {
    expect((await open("nope")).status).toBe(404);

    getCurrentUser.mockResolvedValueOnce(null);
    expect((await open()).status).toBe(401);

    getCurrentUser.mockResolvedValueOnce({ id: "user-9", email: "boss@acme.example", accountType: "employer" });
    expect((await open()).status).toBe(404);

    expect(from).not.toHaveBeenCalled();
  });

  it("answers 404 for another candidate's CV, or one not in the bucket", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await open()).status).toBe(404);
    expect(getObject).not.toHaveBeenCalled();

    getObject.mockResolvedValueOnce(null);
    expect((await open()).status).toBe(404);
  });

  it("answers 500 when the database or R2 fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "boom" } });
    expect((await open()).status).toBe(500);

    getObject.mockRejectedValueOnce(new Error("R2 get failed: 503"));
    expect((await open()).status).toBe(500);
  });

  it("is limited to 120 a minute", async () => {
    hit.mockResolvedValue({ count: 121, resetAt: Date.now() + 30_000 });

    const response = await open();
    expect(response.status).toBe(429);
    expect(hit).toHaveBeenCalledWith(`cv-open:user-1`, 60_000);
    expect(from).not.toHaveBeenCalled();
  });
});
