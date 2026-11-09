import { describe, expect, it } from "vitest";
import { activeNavHref } from "./active-nav-item";

const EMPLOYER_ITEMS = ["/acme", "/acme/profile"];
const CANDIDATE_ITEMS = ["/dashboard", "/saved-jobs", "/applications", "/profile"];

describe("activeNavHref", () => {
  it("is the item whose address is the path", () => {
    expect(activeNavHref("/acme", EMPLOYER_ITEMS)).toBe("/acme");
    expect(activeNavHref("/acme/profile", EMPLOYER_ITEMS)).toBe("/acme/profile");
    expect(activeNavHref("/saved-jobs", CANDIDATE_ITEMS)).toBe("/saved-jobs");
  });

  it("keeps Dashboard for the pages under it, except the one that has an item of its own", () => {
    expect(activeNavHref("/acme/jobs/new", EMPLOYER_ITEMS)).toBe("/acme");
    expect(activeNavHref("/acme/jobs/7c9e6679/edit", EMPLOYER_ITEMS)).toBe("/acme");
    expect(activeNavHref("/acme/profile", EMPLOYER_ITEMS)).not.toBe("/acme");
  });

  it("goes by the longest address, whatever the order of the items", () => {
    expect(activeNavHref("/acme/profile", ["/acme/profile", "/acme"])).toBe("/acme/profile");
  });

  it("counts whole path segments, so a longer name that starts the same does not match", () => {
    expect(activeNavHref("/acme-labs", EMPLOYER_ITEMS)).toBeNull();
    expect(activeNavHref("/profiles", CANDIDATE_ITEMS)).toBeNull();
  });

  it("is null when no item matches", () => {
    expect(activeNavHref("/settings", CANDIDATE_ITEMS)).toBeNull();
    expect(activeNavHref("/", [])).toBeNull();
  });
});
