import type { AtsName } from "../types";
import { getAdapter } from "./registry";

export type AtsMatch = { ats: AtsName; slug: string };

type Pattern = {
  ats: AtsName;
  re: RegExp;
  slug?: (match: RegExpMatchArray) => string;
  // Path segments or subdomains that belong to the ATS itself, not to a customer.
  skip?: string[];
};

const SUBDOMAIN_SKIP = ["www", "app", "api", "cdn", "assets", "static", "help", "support", "docs"];

const PATTERNS: Pattern[] = [
  {
    ats: "greenhouse",
    re: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([a-z0-9_-]+)/gi,
    skip: ["embed", "v1"],
  },
  { ats: "greenhouse", re: /boards-api(?:\.eu)?\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/gi },
  { ats: "lever", re: /jobs\.(?:eu\.)?lever\.co\/([a-z0-9_.-]+)/gi },
  { ats: "lever", re: /api\.(?:eu\.)?lever\.co\/v0\/postings\/([a-z0-9_.-]+)/gi },
  { ats: "ashby", re: /jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/gi, skip: ["api"] },
  { ats: "ashby", re: /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_.%-]+)/gi },
  {
    ats: "workable",
    re: /apply\.workable\.com\/(?:api\/v\d+\/(?:widget\/)?accounts\/)?([a-z0-9_-]+)/gi,
    skip: ["api", "j"],
  },
  {
    ats: "workable",
    re: /\b([a-z0-9-]+)\.workable\.com/gi,
    skip: [...SUBDOMAIN_SKIP, "apply", "resources", "jobs", "careers"],
  },
  {
    ats: "smartrecruiters",
    re: /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/gi,
    skip: ["oneclick-ui", "sr-jobs", "ni"],
  },
  { ats: "smartrecruiters", re: /api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)/gi },
  { ats: "recruitee", re: /\b([a-z0-9-]+)\.recruitee\.com/gi, skip: SUBDOMAIN_SKIP },
  {
    ats: "breezy",
    re: /\b([a-z0-9-]+)\.breezy\.hr/gi,
    skip: [...SUBDOMAIN_SKIP, "assets-cdn", "gallery-cdn", "attachments-cdn", "marketing", "developer"],
  },
  { ats: "personio", re: /\b([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/gi },
  {
    ats: "workday",
    re: /\b([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:wday\/cxs\/[a-z0-9_-]+\/)?(?:[a-z]{2}-[a-z]{2}\/)?([a-z0-9_-]+)/gi,
    slug: (m) => (m[3].toLowerCase() === "wday" ? "" : `${m[1]}|${m[2]}|${m[3]}`),
  },
  { ats: "pinpoint", re: /\b([a-z0-9-]+)\.pinpointhq\.com/gi, skip: SUBDOMAIN_SKIP },
  { ats: "teamtailor", re: /\b([a-z0-9-]+)\.teamtailor\.com/gi, skip: [...SUBDOMAIN_SKIP, "scripts", "career"] },
  { ats: "talentlyft", re: /\b([a-z0-9-]+)\.talentlyft\.com/gi, skip: SUBDOMAIN_SKIP },
  { ats: "bamboohr", re: /\b([a-z0-9-]+)\.bamboohr\.com/gi, skip: [...SUBDOMAIN_SKIP, "marketplace", "partners"] },
  { ats: "jobvite", re: /jobs\.jobvite\.com\/([a-z0-9_-]+)/gi },
  { ats: "icims", re: /\b([a-z0-9-]+)\.icims\.com/gi, skip: SUBDOMAIN_SKIP },
  { ats: "successfactors", re: /(?:sapsf|successfactors)\.(?:com|eu)\/career\?company=([a-z0-9_-]+)/gi },
  { ats: "comeet", re: /comeet\.(?:co|com)\/jobs\/([a-z0-9_.-]+)/gi },
  { ats: "hibob", re: /\b([a-z0-9-]+)\.careers\.hibob\.com/gi },
  { ats: "jazzhr", re: /\b([a-z0-9-]+)\.applytojob\.com/gi, skip: SUBDOMAIN_SKIP },
  { ats: "join", re: /join\.com\/companies\/([a-z0-9_-]+)/gi },
];

// Scans URLs or HTML; ATSs with an adapter come first, then the most mentioned slug.
export function detectAts(texts: string[]): AtsMatch[] {
  const counts = new Map<string, { match: AtsMatch; count: number }>();
  for (const raw of texts) {
    // JSON inside <script> escapes slashes as "\/".
    const text = raw.replace(/\\\//g, "/");
    for (const pattern of PATTERNS) {
      for (const m of text.matchAll(pattern.re)) {
        const slug = pattern.slug ? pattern.slug(m) : m[1];
        if (!slug || pattern.skip?.includes(slug.toLowerCase())) continue;
        const key = `${pattern.ats}:${slug.toLowerCase()}`;
        const entry = counts.get(key) ?? { match: { ats: pattern.ats, slug }, count: 0 };
        entry.count++;
        counts.set(key, entry);
      }
    }
  }
  return [...counts.values()]
    .sort(
      (a, b) =>
        Number(Boolean(getAdapter(b.match.ats))) - Number(Boolean(getAdapter(a.match.ats))) ||
        b.count - a.count,
    )
    .map((entry) => entry.match);
}

export function pickAts(texts: string[]): AtsMatch | null {
  return detectAts(texts)[0] ?? null;
}
