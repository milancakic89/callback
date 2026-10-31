import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser, hit, from, select, eq, is, maybeSingle, storageFrom, download } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const is = vi.fn(() => ({ maybeSingle }));
  const eq = vi.fn(() => ({ is }));
  const select = vi.fn(() => ({ eq }));
  const download = vi.fn();
  return {
    getCurrentUser: vi.fn(),
    hit: vi.fn(),
    from: vi.fn(() => ({ select })),
    select,
    eq,
    is,
    maybeSingle,
    storageFrom: vi.fn(() => ({ download })),
    download,
  };
});

vi.mock("@/lib/auth/dal", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { storage: { from: storageFrom } } }));

import { GET } from "./route";

const APPLICATION_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";
const PDF = new Blob(["%PDF-1.7"], { type: "application/pdf" });

function get(kind = "cv", { id = APPLICATION_ID, dest = "empty" as string | null } = {}) {
  const headers = new Headers();
  if (dest !== null) headers.set("sec-fetch-dest", dest);
  const request = new NextRequest(`https://callback.rs/api/applications/${id}/documents/${kind}`, { headers });
  return GET(request, { params: Promise.resolve({ applicationId: id, kind }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user-1", email: "boss@acme.example", accountType: "employer" });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  maybeSingle.mockResolvedValue({
    data: { cv_path: "mock/ana-novak/cv.pdf", cover_letter_path: "mock/ana-novak/cover-letter.pdf" },
    error: null,
  });
  download.mockResolvedValue({ data: PDF, error: null });
});

describe("GET an application's document", () => {
  it("answers the CV as an inline PDF that is never cached", async () => {
    const response = await get("cv");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("%PDF-1.7");
    expect(storageFrom).toHaveBeenCalledWith("application-documents");
    expect(download).toHaveBeenCalledWith("mock/ana-novak/cv.pdf");
  });

  it("checks the application with the caller's own client, and never a withdrawn one", async () => {
    await get("cover-letter");

    expect(from).toHaveBeenCalledWith("job_applications");
    expect(select).toHaveBeenCalledWith("cover_letter_path");
    expect(eq).toHaveBeenCalledWith("id", APPLICATION_ID);
    expect(is).toHaveBeenCalledWith("withdrawn_at", null);
    expect(download).toHaveBeenCalledWith("mock/ana-novak/cover-letter.pdf");
  });

  it("refuses a bad id or kind before anything else runs", async () => {
    for (const [kind, id] of [
      ["cv", "not-a-uuid"],
      ["resume", APPLICATION_ID],
      ["cv_path", APPLICATION_ID],
    ]) {
      expect((await get(kind, { id })).status, `${kind} ${id}`).toBe(404);
    }
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a browser navigation, so the browser's own viewer never opens the file", async () => {
    for (const dest of ["document", "iframe", "object", "embed"]) {
      expect((await get("cv", { dest })).status, dest).toBe(404);
    }
    expect(from).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("serves a client that sends no Fetch Metadata", async () => {
    expect((await get("cv", { dest: null })).status).toBe(200);
  });

  it("asks a visitor without a session to sign in", async () => {
    getCurrentUser.mockResolvedValue(null);

    const response = await get();
    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("answers a candidate account with the same 404", async () => {
    getCurrentUser.mockResolvedValue({ id: "user-2", email: "me@example.com", accountType: "candidate" });

    expect((await get()).status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });

  it("answers 404 when row level security finds no application, or it has no such document", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await get()).status).toBe(404);

    maybeSingle.mockResolvedValue({ data: { cover_letter_path: null }, error: null });
    expect((await get("cover-letter")).status).toBe(404);

    expect(download).not.toHaveBeenCalled();
  });

  it("answers 404 when the file isn't in the bucket", async () => {
    download.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    expect((await get()).status).toBe(404);
  });

  it("answers 500 on a database error, without reading the file", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect((await get()).status).toBe(500);
    expect(download).not.toHaveBeenCalled();
  });

  it("is limited to 240 a minute per employer", async () => {
    await get();
    expect(hit).toHaveBeenCalledWith("review-doc:user-1", 60_000);

    hit.mockResolvedValue({ count: 240, resetAt: Date.now() + 60_000 });
    expect((await get()).status).toBe(200);

    hit.mockResolvedValue({ count: 241, resetAt: Date.now() + 30_000 });
    from.mockClear();
    const response = await get();
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(from).not.toHaveBeenCalled();
  });
});
