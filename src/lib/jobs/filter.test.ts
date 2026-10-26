import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIndex, compileRules, matchesRules, matchesSearch, normalizeText, sortJobs } from "./filter";
import type { FilterRule } from "./filter-schema";
import type { JobListItem } from "./types";

let nextId = 0;

function job(overrides: Partial<JobListItem> = {}): JobListItem {
  nextId += 1;
  return {
    id: `greenhouse:${nextId}`,
    title: "Developer",
    companyName: "Acme",
    locationRaw: null,
    department: null,
    workMode: null,
    postedAt: null,
    firstSeenAt: "2026-10-01T00:00:00.000Z",
    url: null,
    source: "greenhouse",
    active: true,
    ...overrides,
  };
}

function rule(field: string, operator: string, values: string[] = []): FilterRule {
  return { id: `${field}-${operator}`, field, operator, values };
}

type RunOptions = {
  showApplied?: boolean;
  includeDescription?: boolean;
  appliedIds?: string[];
  descriptions?: Record<string, string> | null;
};

// Runs rules the way JobsExplorer does (index, compile, match) and returns the matching titles.
function run(jobs: JobListItem[], rules: FilterRule[], options: RunOptions = {}): string[] {
  const { showApplied = false, includeDescription = true, appliedIds = [], descriptions = null } = options;
  const index = buildIndex(jobs, descriptions);
  const compiled = compileRules(rules, { showApplied, includeDescription });
  const applied = showApplied ? new Set(appliedIds) : null;
  return index.filter((entry) => matchesRules(entry, compiled, applied)).map((entry) => entry.job.title);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizeText", () => {
  it("lowercases and strips diacritics, so Serbian names match plain typing", () => {
    expect(normalizeText("Čačak")).toBe("cacak");
    expect(normalizeText("Šabac")).toBe("sabac");
    expect(normalizeText("Žarko Ćirić")).toBe("zarko ciric");
  });

  it("turns đ into dj", () => {
    expect(normalizeText("Đorđe")).toBe("djordje");
  });

  it("drops hyphens, so front-end and frontend are the same word", () => {
    expect(normalizeText("Front-End")).toBe("frontend");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeText("  Senior \t  Dev  ")).toBe("senior dev");
  });
});

describe("matchesSearch", () => {
  const [entry] = buildIndex([job({ title: "Senior React Developer", companyName: "Acme Labs" })], null);

  it("matches everything when nothing is typed", () => {
    expect(matchesSearch(entry, "")).toBe(true);
    expect(matchesSearch(entry, "   ")).toBe(true);
  });

  it("needs every typed word, in any order, across title and company", () => {
    expect(matchesSearch(entry, "labs react")).toBe(true);
    expect(matchesSearch(entry, "react python")).toBe(false);
  });

  it("is a loose substring match while typing", () => {
    expect(matchesSearch(entry, "reac")).toBe(true);
  });

  it("ignores diacritics in the job text", () => {
    const [serbian] = buildIndex([job({ title: "Developer u Čačku", companyName: "Acme" })], null);
    expect(matchesSearch(serbian, "cacku")).toBe(true);
  });

  it("searches only title and company, not location", () => {
    const [located] = buildIndex([job({ locationRaw: "Belgrade" })], null);
    expect(matchesSearch(located, "belgrade")).toBe(false);
  });
});

describe("text rules", () => {
  it("match whole words only: java does not match javascript", () => {
    const jobs = [job({ title: "JavaScript Developer" }), job({ title: "Java Developer" })];
    expect(run(jobs, [rule("title", "contains_any", ["java"])])).toEqual(["Java Developer"]);
  });

  it("contains_any needs one of the values", () => {
    const jobs = [job({ title: "React Developer" }), job({ title: "Vue Developer" }), job({ title: "Go Developer" })];
    expect(run(jobs, [rule("title", "contains_any", ["react", "vue"])])).toEqual(["React Developer", "Vue Developer"]);
  });

  it("contains_all needs every value", () => {
    const jobs = [job({ title: "Senior React Developer" }), job({ title: "Junior React Developer" })];
    expect(run(jobs, [rule("title", "contains_all", ["senior", "react"])])).toEqual(["Senior React Developer"]);
  });

  it("contains_none leaves out the jobs that have any of the values", () => {
    const jobs = [job({ title: "Intern Developer" }), job({ title: "Senior Developer" })];
    expect(run(jobs, [rule("title", "contains_none", ["intern"])])).toEqual(["Senior Developer"]);
  });

  it("ignores case and diacritics in both the job and the rule", () => {
    const jobs = [job({ title: "A", locationRaw: "Čačak, Serbia" }), job({ title: "B", locationRaw: "Niš" })];
    expect(run(jobs, [rule("location", "contains_any", ["CACAK"])])).toEqual(["A"]);
  });

  it("treats front-end and frontend as the same word", () => {
    const jobs = [job({ title: "Front-End Developer" })];
    expect(run(jobs, [rule("title", "contains_any", ["frontend"])])).toEqual(["Front-End Developer"]);
  });

  it("is_empty and is_not_empty look at the field's text", () => {
    const jobs = [job({ title: "No team", department: null }), job({ title: "Has team", department: "Engineering" })];
    expect(run(jobs, [rule("department", "is_empty")])).toEqual(["No team"]);
    expect(run(jobs, [rule("department", "is_not_empty")])).toEqual(["Has team"]);
  });

  it("treats a typed value as text, never as a pattern", () => {
    const jobs = [job({ title: "Anything goes" }), job({ title: "C++ Developer" })];
    expect(run(jobs, [rule("title", "contains_any", [".*"])])).toEqual([]);
    expect(run(jobs, [rule("title", "contains_any", ["c++"])])).toEqual(["C++ Developer"]);
  });

  it("does nothing while a rule has no usable value", () => {
    const jobs = [job({ title: "A" }), job({ title: "B" })];
    expect(compileRules([rule("title", "contains_any", [])], { showApplied: false, includeDescription: true })).toHaveLength(0);
    expect(run(jobs, [rule("title", "contains_any", [])])).toEqual(["A", "B"]);
    expect(run(jobs, [rule("title", "contains_any", ["   "])])).toEqual(["A", "B"]);
  });

  it("combines rules with AND", () => {
    const jobs = [
      job({ title: "React Developer", workMode: "REMOTE" }),
      job({ title: "React Designer", workMode: "ON_SITE" }),
      job({ title: "Vue Developer", workMode: "REMOTE" }),
    ];
    const rules = [rule("title", "contains_any", ["react"]), rule("workMode", "is_any", ["REMOTE"])];
    expect(run(jobs, rules)).toEqual(["React Developer"]);
  });
});

describe("description rules", () => {
  const withPostgres = job({ title: "With" });
  const without = job({ title: "Without" });
  const descriptions = { [withPostgres.id]: "We run Postgres every day", [without.id]: "We run MySQL" };
  const postgres = [rule("description", "contains_any", ["postgres"])];

  it("search the loaded descriptions", () => {
    expect(run([withPostgres, without], postgres, { descriptions })).toEqual(["With"]);
  });

  it("are skipped, not applied against empty text, while descriptions haven't loaded", () => {
    expect(run([withPostgres, without], postgres, { includeDescription: false })).toEqual(["With", "Without"]);
  });
});

describe("work mode rules", () => {
  const jobs = [
    job({ title: "Remote", workMode: "REMOTE" }),
    job({ title: "Hybrid", workMode: "HYBRID" }),
    job({ title: "On-site", workMode: "ON_SITE" }),
    job({ title: "Unknown", workMode: null }),
  ];

  it("is_any keeps the listed modes and never an unknown one", () => {
    expect(run(jobs, [rule("workMode", "is_any", ["REMOTE", "HYBRID"])])).toEqual(["Remote", "Hybrid"]);
  });

  it("is_none keeps everything else, including an unknown mode", () => {
    expect(run(jobs, [rule("workMode", "is_none", ["REMOTE"])])).toEqual(["Hybrid", "On-site", "Unknown"]);
  });

  it("is_unknown keeps only jobs without a mode", () => {
    expect(run(jobs, [rule("workMode", "is_unknown")])).toEqual(["Unknown"]);
  });

  it("ignores values that aren't work modes", () => {
    expect(run(jobs, [rule("workMode", "is_any", ["TELEPORT"])])).toHaveLength(4);
  });
});

describe("posted rules", () => {
  const jobs = () => [
    job({ title: "Yesterday", postedAt: "2026-10-24T12:00:00.000Z" }),
    job({ title: "Two weeks ago", postedAt: "2026-10-11T12:00:00.000Z" }),
    // No posted date: the date the scraper first saw it stands in, as in the table.
    job({ title: "First seen yesterday", postedAt: null, firstSeenAt: "2026-10-24T12:00:00.000Z" }),
  ];

  function atNow() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00.000Z"));
  }

  it("in_last_days uses the posted date, or first-seen when there is none", () => {
    atNow();
    expect(run(jobs(), [rule("posted", "in_last_days", ["7"])])).toEqual(["Yesterday", "First seen yesterday"]);
  });

  it("before and after compare against a date", () => {
    atNow();
    expect(run(jobs(), [rule("posted", "before", ["2026-10-15"])])).toEqual(["Two weeks ago"]);
    expect(run(jobs(), [rule("posted", "after", ["2026-10-15"])])).toEqual(["Yesterday", "First seen yesterday"]);
  });

  it("do nothing with a day count or date that isn't one", () => {
    atNow();
    for (const bad of [rule("posted", "in_last_days", ["abc"]), rule("posted", "in_last_days", ["0"]), rule("posted", "before", ["soon"])]) {
      expect(run(jobs(), [bad])).toHaveLength(3);
    }
  });
});

describe("applied rules", () => {
  const applied = job({ title: "Applied" });
  const notApplied = job({ title: "Not applied" });
  const options = { showApplied: true, appliedIds: [applied.id] };

  it("is_applied and is_not_applied split the list", () => {
    expect(run([applied, notApplied], [rule("applied", "is_applied")], options)).toEqual(["Applied"]);
    expect(run([applied, notApplied], [rule("applied", "is_not_applied")], options)).toEqual(["Not applied"]);
  });

  it("are ignored on the public list, which has no Applied column", () => {
    expect(run([applied, notApplied], [rule("applied", "is_applied")])).toEqual(["Applied", "Not applied"]);
  });
});

describe("rules this version doesn't know", () => {
  it("stay inert instead of hiding every job", () => {
    const jobs = [job({ title: "A" }), job({ title: "B" })];
    expect(run(jobs, [rule("salary", "greater_than", ["1"])])).toEqual(["A", "B"]);
    expect(run(jobs, [rule("title", "sounds_like", ["a"])])).toEqual(["A", "B"]);
  });
});

describe("sortJobs", () => {
  const alpha = job({ title: "Alpha", companyName: "Zed", postedAt: "2026-10-03T00:00:00.000Z", workMode: "ON_SITE" });
  const beta = job({ title: "Beta", companyName: "Acme", postedAt: "2026-10-01T00:00:00.000Z", workMode: "REMOTE" });
  const gamma = job({ title: "Gamma", companyName: "Mid", postedAt: null, firstSeenAt: "2026-10-02T00:00:00.000Z", workMode: null });
  const titles = (jobs: JobListItem[]) => jobs.map((j) => j.title);

  it("sorts by title, in both directions", () => {
    expect(titles(sortJobs([gamma, alpha, beta], "title", "asc"))).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(titles(sortJobs([gamma, alpha, beta], "title", "desc"))).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("sorts by company", () => {
    expect(titles(sortJobs([alpha, beta, gamma], "company", "asc"))).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("sorts by posted date, falling back to first-seen", () => {
    expect(titles(sortJobs([alpha, beta, gamma], "posted", "asc"))).toEqual(["Beta", "Gamma", "Alpha"]);
    expect(titles(sortJobs([alpha, beta, gamma], "posted", "desc"))).toEqual(["Alpha", "Gamma", "Beta"]);
  });

  it("sorts by work mode: remote, hybrid, on-site, then unknown", () => {
    expect(titles(sortJobs([gamma, alpha, beta], "workMode", "asc"))).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("does not change the list it is given", () => {
    const input = [gamma, alpha, beta];
    sortJobs(input, "title", "asc");
    expect(titles(input)).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  describe("jobs posted on Callback", () => {
    const mid = job({ title: "Mid", source: "callback", postedAt: "2026-09-01T00:00:00.000Z" });
    const zeta = job({ title: "Zeta", source: "callback", postedAt: "2026-09-02T00:00:00.000Z" });

    it("always come first, whichever way the list is sorted", () => {
      expect(titles(sortJobs([alpha, mid, beta, zeta], "title", "asc"))).toEqual(["Mid", "Zeta", "Alpha", "Beta"]);
      expect(titles(sortJobs([alpha, mid, beta, zeta], "title", "desc"))).toEqual(["Zeta", "Mid", "Beta", "Alpha"]);
    });

    it("come first even when they are the oldest", () => {
      expect(titles(sortJobs([alpha, beta, mid], "posted", "desc"))[0]).toBe("Mid");
    });
  });
});
