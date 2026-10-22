import { placeJob } from "../normalize";
import { coreName, domainLabel, namesMatch, plain } from "../text";
import type { AtsName, Company } from "../types";
import type { AtsProbe } from "./adapter";
import { getAdapter } from "./registry";

const GUESS_ATS: AtsName[] = [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
  "breezy",
];

// Domain labels that say nothing about the company (website hosted elsewhere).
const GENERIC_LABELS = new Set([
  "facebook",
  "linkedin",
  "instagram",
  "google",
  "wix",
  "wixsite",
  "wordpress",
  "github",
  "medium",
  "blogspot",
  "webflow",
]);

export type AtsGuess = {
  ats: AtsName;
  slug: string;
  confidence: number;
  // Jobs that pass the Serbia + remote filter. A real but empty or foreign-only board
  // (an abandoned account, a sister company's board) should not hide the actual careers page.
  relevantJobs: number;
};

export function slugCandidates(company: Company): string[] {
  const candidates = new Set<string>();
  const label = company.website ? domainLabel(company.website) : null;
  if (label && !GENERIC_LABELS.has(label)) candidates.add(label);
  const core = coreName(company.name);
  if (core) {
    candidates.add(core.replace(/ /g, ""));
    candidates.add(core.replace(/ /g, "-"));
  }
  return [...candidates].filter((slug) => slug.length >= 3).slice(0, 3);
}

// A guessed board only counts when it provably belongs to this company.
function confirm(company: Company, slug: string, probe: AtsProbe): number | null {
  const label = company.website ? domainLabel(company.website) : null;
  if (probe.name) {
    if (!namesMatch(company.name, probe.name)) return null;
    return slug === label ? 0.95 : 0.85;
  }
  // Lever and Ashby report no company name: require the domain slug plus a mention in the postings.
  const [firstWord] = coreName(company.name).split(" ");
  const text = plain(probe.sampleText);
  if (slug === label && firstWord?.length >= 4 && text.includes(firstWord)) return 0.7;
  return null;
}

async function countRelevantJobs(company: Company, ats: AtsName, slug: string): Promise<number> {
  const jobs = (await getAdapter(ats)?.fetchJobs(slug).catch(() => [])) ?? [];
  return jobs.filter((job) => placeJob(job, company.offices).keep).length;
}

export async function guessAts(company: Company): Promise<AtsGuess | null> {
  for (const slug of slugCandidates(company)) {
    const results = await Promise.all(
      GUESS_ATS.map(async (ats): Promise<AtsGuess | null> => {
        const probe = await getAdapter(ats)
          ?.probe?.(slug)
          .catch(() => null);
        if (!probe) return null;
        const confidence = confirm(company, slug, probe);
        if (confidence === null) return null;
        const relevantJobs = probe.jobCount === 0 ? 0 : await countRelevantJobs(company, ats, slug);
        return { ats, slug, confidence, relevantJobs };
      }),
    );
    const hits = results.filter((hit): hit is AtsGuess => hit !== null);
    if (hits.length) {
      return hits.sort((a, b) => b.relevantJobs - a.relevantJobs || b.confidence - a.confidence)[0];
    }
  }
  return null;
}
