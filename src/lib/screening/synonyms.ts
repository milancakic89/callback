import { canonText } from "./canon";

// Words an employer may write for the same thing, and a CV may write another way (features/
// cv-screening.md). A filter matches when the CV has the filter's own words or any other member of its
// group. Conservative on purpose: a word that is also an ordinary one ("go", "rest", "swift") stays
// out, since a false "met" is worse than a "missing" the reviewer can correct by reading the CV.
// Written in plain lower case; canonText() makes them comparable at load. Add a group when a real
// job needs it, and a case to match.test.ts.
const GROUPS: string[][] = [
  // Languages and frameworks
  ["javascript", "js", "ecmascript"],
  ["typescript", "ts"],
  ["react", "react.js", "reactjs"],
  ["vue", "vue.js", "vuejs"],
  ["next.js", "nextjs"],
  ["node.js", "nodejs"],
  ["c#", "csharp", "c sharp"],
  ["c++", "cpp"],
  [".net", "dotnet", "dot net"],
  ["html", "html5"],
  ["css", "css3"],
  ["rest api", "restful", "restful api"],
  // Data and infrastructure
  ["postgresql", "postgres"],
  ["mongodb", "mongo"],
  ["kubernetes", "k8s"],
  ["amazon web services", "aws"],
  ["google cloud", "google cloud platform", "gcp"],
  ["continuous integration", "ci/cd", "cicd"],
  ["machine learning", "ml"],
  ["artificial intelligence", "ai"],
  // Design and office
  ["user experience", "ux"],
  ["user interface", "ui"],
  ["accessibility", "a11y", "wcag"],
  ["mentoring", "mentorship", "mentor"],
  ["adobe photoshop", "photoshop"],
  ["adobe illustrator", "illustrator"],
  ["excel", "microsoft excel", "ms excel"],
  // Languages people speak, in English and in the local one
  ["english", "engleski"],
  ["german", "deutsch", "nemacki"],
  ["serbian", "srpski"],
  ["french", "francais", "francuski"],
];

const CANON_GROUPS = GROUPS.map((group) => [...new Set(group.map(canonText))]);

// The other members of the group `canonLabel` (already canonical) belongs to; empty when it has none.
export function synonymsOf(canonLabel: string): string[] {
  const group = CANON_GROUPS.find((members) => members.includes(canonLabel));
  return group ? group.filter((member) => member !== canonLabel) : [];
}
