import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccountType, hit, rpc, refreshSession, updateUserById, getOwnCompany, redirect } = vi.hoisted(() => ({
  requireAccountType: vi.fn(),
  hit: vi.fn(),
  rpc: vi.fn(),
  refreshSession: vi.fn(),
  updateUserById: vi.fn(),
  getOwnCompany: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/companies/get-company", () => ({ getOwnCompany }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc, auth: { refreshSession } }) }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { auth: { admin: { updateUserById } } } }));

import { continueToCompany, setUpCompany } from "./actions";

const USER = { id: "user-1", email: "boss@acme.example", accountType: "employer", companySlug: null };

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Acme d.o.o.", slug: "acme", ...fields })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAccountType.mockResolvedValue(USER);
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  rpc.mockResolvedValue({ data: null, error: null });
  updateUserById.mockResolvedValue({ error: null });
  refreshSession.mockResolvedValue({ error: null });
  getOwnCompany.mockResolvedValue(null);
  // The real redirect() throws to stop the action; so does this one.
  redirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});

function touchedNothing() {
  expect(requireAccountType).not.toHaveBeenCalled();
  expect(hit).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(updateUserById).not.toHaveBeenCalled();
  expect(refreshSession).not.toHaveBeenCalled();
}

describe("setUpCompany", () => {
  it("refuses bad input before it touches anything", async () => {
    expect((await setUpCompany({}, form({ name: "   " }))).fieldErrors?.name).toEqual(["Enter your company's name."]);
    expect((await setUpCompany({}, form({ name: "x".repeat(101) }))).fieldErrors?.name).toBeDefined();
    for (const slug of ["", "ab", "-acme", "acme-", "Acme", "ac me", "acme.rs", "x".repeat(41)]) {
      expect((await setUpCompany({}, form({ slug }))).fieldErrors?.slug, JSON.stringify(slug)).toBeDefined();
    }
    expect((await setUpCompany({}, form({ slug: "jobs" }))).fieldErrors?.slug).toEqual(["This address isn't available. Try another."]);
    expect((await setUpCompany({}, new FormData())).fieldErrors).toBeDefined();
    touchedNothing();
  });

  it("is for employers: it asks requireAccountType before the limit and the database", async () => {
    requireAccountType.mockRejectedValue(new Error("NEXT_REDIRECT:/dashboard"));
    await expect(setUpCompany({}, form())).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(requireAccountType).toHaveBeenCalledExactlyOnceWith("employer");
    expect(hit).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("allows 10 an hour per employer, and stops there", async () => {
    hit.mockResolvedValue({ count: 11, resetAt: Date.now() + 60_000 });
    expect(await setUpCompany({}, form())).toEqual({ error: "Too many attempts. Please try again later." });
    expect(hit).toHaveBeenCalledExactlyOnceWith("set-up-company:user-1", 60 * 60_000);
    expect(rpc).not.toHaveBeenCalled();

    hit.mockResolvedValue({ count: 10, resetAt: Date.now() + 60_000 });
    await expect(setUpCompany({}, form())).rejects.toThrow("NEXT_REDIRECT:/acme");
  });

  it("saves the trimmed name and the slug, puts the slug in the account, refreshes the session and goes there", async () => {
    await expect(setUpCompany({}, form({ name: "  Acme d.o.o.  " }))).rejects.toThrow("NEXT_REDIRECT:/acme");

    expect(rpc).toHaveBeenCalledExactlyOnceWith("set_up_company", { p_name: "Acme d.o.o.", p_slug: "acme" });
    // Supabase merges app_metadata, so account_type stays.
    expect(updateUserById).toHaveBeenCalledExactlyOnceWith("user-1", { app_metadata: { company_slug: "acme" } });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledExactlyOnceWith("/acme");
  });

  it("does the steps in order: database, then the account, then the session, then the redirect", async () => {
    const order: string[] = [];
    rpc.mockImplementation(async () => (order.push("rpc"), { error: null }));
    updateUserById.mockImplementation(async () => (order.push("account"), { error: null }));
    refreshSession.mockImplementation(async () => (order.push("session"), { error: null }));
    redirect.mockImplementation((path: string) => {
      order.push("redirect");
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
    await expect(setUpCompany({}, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(order).toEqual(["rpc", "account", "session", "redirect"]);
  });

  it("answers 'This address is taken.' for a slug another company has", async () => {
    rpc.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    expect(await setUpCompany({}, form())).toEqual({ fieldErrors: { slug: ["This address is taken."] } });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("maps the other database errors to the field they belong to", async () => {
    rpc.mockResolvedValue({ error: { code: "23514", message: "check" } });
    expect((await setUpCompany({}, form())).fieldErrors?.slug).toBeDefined();

    rpc.mockResolvedValue({ error: { code: "22023", message: "name" } });
    expect((await setUpCompany({}, form())).fieldErrors?.name).toBeDefined();
  });

  it("sends a company that already has an address to /setup, where Continue is", async () => {
    rpc.mockResolvedValue({ error: { code: "55000", message: "already" } });
    await expect(setUpCompany({}, form())).rejects.toThrow("NEXT_REDIRECT:/setup");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("answers a generic error for anything else, and changes no account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    expect(await setUpCompany({}, form())).toEqual({ error: "Something went wrong. Please try again." });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("goes to /setup when the company is saved but the account or the session isn't updated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    updateUserById.mockResolvedValue({ error: { code: "unexpected_failure", message: "boom" } });
    await expect(setUpCompany({}, form())).rejects.toThrow("NEXT_REDIRECT:/setup");
    expect(refreshSession).not.toHaveBeenCalled();

    updateUserById.mockResolvedValue({ error: null });
    refreshSession.mockResolvedValue({ error: { code: "unexpected_failure", message: "boom" } });
    await expect(setUpCompany({}, form())).rejects.toThrow("NEXT_REDIRECT:/setup");
  });
});

describe("continueToCompany", () => {
  it("is for employers and has the same limit", async () => {
    requireAccountType.mockRejectedValue(new Error("NEXT_REDIRECT:/dashboard"));
    await expect(continueToCompany()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(requireAccountType).toHaveBeenCalledExactlyOnceWith("employer");

    requireAccountType.mockResolvedValue(USER);
    hit.mockResolvedValue({ count: 11, resetAt: Date.now() + 60_000 });
    expect(await continueToCompany()).toEqual({ error: "Too many attempts. Please try again later." });
    expect(hit).toHaveBeenCalledExactlyOnceWith("set-up-company:user-1", 60 * 60_000);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("only updates the account and the session with the company's own slug, then goes there", async () => {
    getOwnCompany.mockResolvedValue({ slug: "acme", name: "Acme" });
    await expect(continueToCompany()).rejects.toThrow("NEXT_REDIRECT:/acme");

    expect(rpc).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledExactlyOnceWith("user-1", { app_metadata: { company_slug: "acme" } });
    expect(refreshSession).toHaveBeenCalledOnce();
  });

  it("goes straight home when the session already knows the slug", async () => {
    requireAccountType.mockResolvedValue({ ...USER, companySlug: "acme" });
    await expect(continueToCompany()).rejects.toThrow("NEXT_REDIRECT:/acme");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("goes back to the form when there is no company with an address", async () => {
    await expect(continueToCompany()).rejects.toThrow("NEXT_REDIRECT:/setup");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("answers an error when the account or the session can't be updated", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getOwnCompany.mockResolvedValue({ slug: "acme", name: "Acme" });
    updateUserById.mockResolvedValue({ error: { code: "unexpected_failure", message: "boom" } });
    expect(await continueToCompany()).toEqual({ error: "Something went wrong. Please try again." });
    expect(redirect).not.toHaveBeenCalled();
  });
});
