import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAccountType, hit, update, updateEq, updateSelect, from, updateTag } = vi.hoisted(() => {
  const updateSelect = vi.fn();
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn<(values: Record<string, unknown>) => { eq: typeof updateEq }>(() => ({ eq: updateEq }));
  return {
    requireAccountType: vi.fn(),
    hit: vi.fn(),
    update,
    updateEq,
    updateSelect,
    from: vi.fn(() => ({ update })),
    updateTag: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ updateTag }));
vi.mock("@/lib/auth/dal", () => ({ requireAccountType }));
vi.mock("@/lib/supabase/rate-limit-store", () => ({ postgresStore: { hit } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

import { PROFILE_SAVED_MESSAGE } from "@/lib/companies/profile";
import { saveCompanyProfile } from "./actions";

const EMPTY_STATE = {};

function profileForm(fields: Record<string, string> = {}): FormData {
  const formData = new FormData();
  const values = {
    description: "We make clinics run on time.",
    website: "acme.com",
    industry: "Healthcare software",
    size: "51-200",
    headquarters: "Belgrade, Serbia",
    ...fields,
  };
  for (const [name, value] of Object.entries(values)) formData.set(name, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAccountType.mockResolvedValue({
    id: "user-1",
    email: "boss@acme.example",
    accountType: "employer",
    companySlug: "acme",
  });
  hit.mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 });
  updateSelect.mockResolvedValue({ data: [{ slug: "acme" }], error: null });
});

describe("saveCompanyProfile", () => {
  it("refuses a bad field before anything else runs, naming the field", async () => {
    const state = await saveCompanyProfile(EMPTY_STATE, profileForm({ website: "javascript:alert(1)", size: "huge" }));

    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(["size", "website"]);
    expect(requireAccountType).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("needs an employer account", async () => {
    const redirected = new Error("NEXT_REDIRECT");
    requireAccountType.mockRejectedValue(redirected);

    await expect(saveCompanyProfile(EMPTY_STATE, profileForm())).rejects.toBe(redirected);
    expect(requireAccountType).toHaveBeenCalledWith("employer");
    expect(from).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("says to set the company up first when the session has no address yet", async () => {
    requireAccountType.mockResolvedValue({ id: "user-1", accountType: "employer", companySlug: null });

    expect(await saveCompanyProfile(EMPTY_STATE, profileForm())).toEqual({ error: "Set up your company first." });
    expect(from).not.toHaveBeenCalled();
  });

  it("stops at the limit, writing nothing", async () => {
    hit.mockResolvedValue({ count: 31, resetAt: Date.now() + 60_000 });

    const state = await saveCompanyProfile(EMPTY_STATE, profileForm());
    expect(state.error).toMatch(/try again in an hour/i);
    expect(from).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("writes exactly the five profile columns, for the session's own company", async () => {
    const state = await saveCompanyProfile(EMPTY_STATE, profileForm());

    expect(state).toEqual({ message: PROFILE_SAVED_MESSAGE });
    expect(from).toHaveBeenCalledWith("companies");
    expect(update).toHaveBeenCalledWith({
      description: "We make clinics run on time.",
      website: "https://acme.com",
      industry: "Healthcare software",
      size: "51-200",
      headquarters: "Belgrade, Serbia",
    });
    expect(updateEq).toHaveBeenCalledWith("slug", "acme");
  });

  it("stores empty fields as null, which clears them", async () => {
    await saveCompanyProfile(EMPTY_STATE, profileForm({ description: "", website: "", industry: " ", size: "", headquarters: "" }));

    expect(update).toHaveBeenCalledWith({
      description: null,
      website: null,
      industry: null,
      size: null,
      headquarters: null,
    });
  });

  it("ignores a slug, a name or an owner sent in the form", async () => {
    await saveCompanyProfile(
      EMPTY_STATE,
      profileForm({ slug: "other", name: "Hijacked", owner_id: "someone-else", company_slug: "other" }),
    );

    expect(updateEq).toHaveBeenCalledWith("slug", "acme");
    const written = update.mock.calls[0]?.[0] ?? {};
    expect(Object.keys(written).sort()).toEqual(["description", "headquarters", "industry", "size", "website"]);
  });

  it("expires the company's cache entry once the profile is saved", async () => {
    await saveCompanyProfile(EMPTY_STATE, profileForm());
    expect(updateTag).toHaveBeenCalledExactlyOnceWith("company:acme");
  });

  it("says the company wasn't found when row level security updates nothing", async () => {
    updateSelect.mockResolvedValue({ data: [], error: null });

    expect(await saveCompanyProfile(EMPTY_STATE, profileForm())).toEqual({ error: "Company not found." });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("reports a database error without saying it was saved", async () => {
    updateSelect.mockResolvedValue({ data: null, error: { code: "23514", message: "boom" } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await saveCompanyProfile(EMPTY_STATE, profileForm())).toEqual({
      error: "Could not save the profile. Try again.",
    });
    expect(updateTag).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
