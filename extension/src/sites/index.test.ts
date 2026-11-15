import { describe, expect, it } from "vitest";
import { EXTERNAL_SOURCES } from "../../../src/lib/external-jobs/sources";
import { ADAPTERS, adapterForHostname } from "./index";

describe("adapterForHostname", () => {
  it("picks the adapter of each site by its host", () => {
    expect(adapterForHostname("www.linkedin.com")?.source).toBe("linkedin");
    expect(adapterForHostname("www.helloworld.rs")?.source).toBe("helloworld");
    expect(adapterForHostname("poslovi.infostud.com")?.source).toBe("infostud");
  });

  it("picks none for any other host, look-alikes included", () => {
    for (const host of ["example.com", "linkedin.com", "www.linkedin.com.evil.rs", "rs.linkedin.com", "infostud.com", ""]) {
      expect(adapterForHostname(host), host).toBeNull();
    }
  });

  it("has one adapter for each source", () => {
    expect(ADAPTERS.map((adapter) => adapter.source).sort()).toEqual([...EXTERNAL_SOURCES].sort());
  });
});
