import { describe, expect, it } from "vitest";
import { canonText } from "./canon";
import { isQuantityFilter, matchFilter, matchFilters, prepareCvText } from "./match";
import { synonymsOf } from "./synonyms";

// What a verdict says about a CV: `cv` goes through prepareCvText like extracted text does.
const verdict = (label: string, cv: string) => matchFilter(label, prepareCvText(cv));

describe("canonText", () => {
  it("lowercases, drops accents and hyphens, and turns other marks into spaces", () => {
    expect(canonText("Čačak")).toBe("cacak");
    expect(canonText("Front-End")).toBe("frontend");
    expect(canonText("English (C1)")).toBe("english c1");
    expect(canonText("UI/UX, Figma & Sketch")).toBe("ui ux figma sketch");
  });

  it("keeps the marks inside tech names", () => {
    expect(canonText("C++")).toBe("c++");
    expect(canonText("C#")).toBe("c#");
    expect(canonText(".NET")).toBe(".net");
    expect(canonText("Node.js")).toBe("node.js");
  });

  it("is idempotent, so a filter and a CV compare in the same form", () => {
    for (const value of ["English (C1)", "Node.js / React", "Đorđe Čačić – CV"]) {
      expect(canonText(canonText(value))).toBe(canonText(value));
    }
  });
});

describe("prepareCvText", () => {
  it("puts back a heading set in wide letter-spacing", () => {
    expect(prepareCvText("P R O F I L E\nProduct designer")).toBe("profile product designer");
    expect(prepareCvText("S K I L L S")).toBe("skills");
  });

  it("does not glue ordinary words, or the one-letter words between them", () => {
    expect(prepareCvText("I a m a designer")).toBe("i a m a designer");
    expect(prepareCvText("Plan A or B")).toBe("plan a or b");
    expect(prepareCvText("Grade A B")).toBe("grade a b");
  });

  it("joins a word broken across two lines by a hyphen", () => {
    expect(prepareCvText("design-\nsystems lead")).toBe("designsystems lead");
    expect(prepareCvText("full-\r\n stack")).toBe("fullstack");
  });

  it("makes lines and runs of spaces one space", () => {
    expect(prepareCvText("Figma  \n\n  Sketch")).toBe("figma sketch");
  });
});

describe("matchFilter: words and phrases", () => {
  it("finds a whole word, ignoring case", () => {
    expect(verdict("Figma", "Worked in FIGMA daily")).toBe("met");
    expect(verdict("Figma", "Worked in Sketch daily")).toBe("missing");
  });

  it("is not fooled by a longer word that contains it: java is not javascript", () => {
    expect(verdict("Java", "Strong JavaScript skills")).toBe("missing");
    expect(verdict("Java", "Java and Kotlin")).toBe("met");
  });

  it("finds a phrase, across line breaks", () => {
    expect(verdict("Design systems", "built the design\nsystems used by 40 people")).toBe("met");
    expect(verdict("Design systems", "design and systems thinking")).toBe("missing");
  });

  it("ignores accents on either side", () => {
    expect(verdict("Čačak", "Lives in Cacak, Serbia")).toBe("met");
    expect(verdict("Cacak", "Živi u Čačku")).toBe("missing");
    expect(verdict("Beograd", "Located in Beograd")).toBe("met");
  });

  it("reads through the punctuation of a CV", () => {
    expect(verdict("English C1", "Languages: English (C1), German (B2)")).toBe("met");
    expect(verdict("German", "Languages: English (C1), German (B2)")).toBe("met");
    expect(verdict("UX", "UI/UX designer")).toBe("met");
  });

  it("finds a filter in a CV whose heading was letter-spaced", () => {
    expect(verdict("Profile", "P R O F I L E\nProduct designer")).toBe("met");
  });

  it("handles names with symbols", () => {
    expect(verdict("C++", "Systems work in C++, Rust and Go")).toBe("met");
    expect(verdict("C#", "Backend in C#.")).toBe("met");
    expect(verdict(".NET", "ASP.NET and .NET 8")).toBe("met");
    expect(verdict("C", "Systems work in C++")).toBe("missing");
  });
});

describe("matchFilter: word forms", () => {
  it("finds a longer word in its other forms", () => {
    expect(verdict("Mentoring", "I mentored two designers")).toBe("met");
    expect(verdict("Mentoring", "Mentor of the junior team")).toBe("met");
    expect(verdict("Prototyping in code", "Prototype in code with React")).toBe("met");
    expect(verdict("Design systems", "Maintained a design system")).toBe("met");
    expect(verdict("Design systems", "Designed systems for ops")).toBe("met");
    expect(verdict("Design systems", "Designed for systems thinking")).toBe("missing");
  });

  it("does not stretch short words: React is not reacted", () => {
    expect(verdict("React", "She reacted quickly to incidents")).toBe("missing");
    expect(verdict("Agile", "agilely")).toBe("missing");
  });

  it("does not turn one job into another: a Designer is not a Design", () => {
    expect(verdict("Designer", "Strong design skills")).toBe("missing");
  });
});

describe("matchFilter: synonyms", () => {
  it("accepts the other names of the same thing", () => {
    expect(verdict("React", "Built apps in React.js")).toBe("met");
    expect(verdict("React", "ReactJS developer")).toBe("met");
    expect(verdict("JavaScript", "Daily JS and TS")).toBe("met");
    expect(verdict("PostgreSQL", "Postgres tuning")).toBe("met");
    expect(verdict("Postgres", "PostgreSQL tuning")).toBe("met");
    expect(verdict("Kubernetes", "k8s clusters")).toBe("met");
    expect(verdict("English", "Engleski: odlično")).toBe("met");
    expect(verdict("Accessibility", "WCAG 2.2 audits")).toBe("met");
  });

  it("keeps the groups symmetrical and free of ordinary words", () => {
    expect(synonymsOf("react")).toContain("react.js");
    expect(synonymsOf("react.js")).toContain("react");
    expect(synonymsOf("figma")).toEqual([]);
    for (const risky of ["go", "rest", "swift", "node"]) expect(synonymsOf(risky), risky).toEqual([]);
  });

  it("does not match a synonym that is only part of a longer word", () => {
    expect(verdict("JavaScript", "Sparkjs and tsconfig")).toBe("missing");
  });
});

describe("matchFilter: what words can't decide", () => {
  it("leaves a quantity to the reviewer", () => {
    for (const label of ["5+ years experience", "3+ godine iskustva", "At least 2 yrs", "10 years", "6 months"]) {
      expect(isQuantityFilter(label), label).toBe(true);
      expect(verdict(label, "Seven years of experience in design"), label).toBe("unverified");
    }
  });

  it("does not take an ordinary filter for a quantity", () => {
    for (const label of ["English C1", "Figma", "Years of mentoring", "Team of 5"]) {
      expect(isQuantityFilter(label), label).toBe(false);
    }
  });

  it("leaves a label with nothing to look for to the reviewer", () => {
    expect(verdict("!!!", "anything")).toBe("unverified");
  });
});

describe("matchFilters", () => {
  it("answers one verdict for each label, keyed by the job's own spelling", () => {
    const result = matchFilters(
      ["Figma", "Design systems", "5+ years experience", "English", "Accessibility"],
      "Ana Novak\nSenior Product Designer\nSeven years in design. Figma, design system work, English (C1).",
    );
    expect(result).toEqual({
      Figma: "met",
      "Design systems": "met",
      "5+ years experience": "unverified",
      English: "met",
      Accessibility: "missing",
    });
  });

  it("answers nothing for no labels", () => {
    expect(matchFilters([], "any text")).toEqual({});
  });
});
