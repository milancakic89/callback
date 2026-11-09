import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcPublic, cacheTag } = vi.hoisted(() => ({ rpcPublic: vi.fn(), cacheTag: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag }));
vi.mock("@/lib/supabase/public", () => ({ supabasePublic: { rpc: rpcPublic } }));

import { getCompanyProfile } from "./profile-queries";

const ROW = {
  name: "Acme d.o.o.",
  slug: "acme",
  description: "We make clinics run on time.",
  website: "https://acme.com",
  industry: "Healthcare software",
  size: "51-200",
  headquarters: "Belgrade, Serbia",
  // Not columns of the public function; a mistake in it must not reach the page.
  owner_id: "secret-owner",
};

beforeEach(() => {
  vi.clearAllMocks();
  rpcPublic.mockResolvedValue({ data: [ROW], error: null });
});

describe("getCompanyProfile", () => {
  it("asks the public function for the slug and maps the row, leaving other columns out", async () => {
    const profile = await getCompanyProfile("acme");

    expect(rpcPublic).toHaveBeenCalledWith("public_company_profile", { p_slug: "acme" });
    expect(profile).toEqual({
      name: "Acme d.o.o.",
      slug: "acme",
      description: "We make clinics run on time.",
      website: "https://acme.com",
      industry: "Healthcare software",
      size: "51-200",
      headquarters: "Belgrade, Serbia",
    });
  });

  it("tags the cache entry with the company, so saving the profile can expire it", async () => {
    await getCompanyProfile("acme");
    expect(cacheTag).toHaveBeenCalledWith("company:acme");
  });

  it("answers null for a company the function doesn't know", async () => {
    rpcPublic.mockResolvedValue({ data: [], error: null });
    expect(await getCompanyProfile("nobody")).toBeNull();
    rpcPublic.mockResolvedValue({ data: null, error: null });
    expect(await getCompanyProfile("nobody")).toBeNull();
  });

  it("answers null without asking when the slug can't be a company's", async () => {
    for (const slug of ["", "A", "jobs", "-acme", "x".repeat(500)]) {
      expect(await getCompanyProfile(slug), slug).toBeNull();
    }
    expect(rpcPublic).not.toHaveBeenCalled();
    expect(cacheTag).not.toHaveBeenCalled();
  });

  it("throws when the database does, so a failure is not cached as 'not found'", async () => {
    rpcPublic.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getCompanyProfile("acme")).rejects.toThrow("public_company_profile: boom");
  });
});
