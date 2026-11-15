import { canonicalJobUrl } from "../../../src/lib/external-jobs/canonical-url";
import { cleanText, firstElement, firstText } from "../dom";
import { detailsOf, lookUpPosting, withoutCompanySuffix } from "../job-posting";
import type { ScrapedJob, SiteAdapter } from "./types";

// Infostud (poslovi.infostud.com): a job's page, /posao/{slug}/{company}/{id}. The site is a Next.js
// application, so a move to another job is no page load: the job is read again on every change. The
// job's data is its JSON-LD JobPosting; the page's own heading is the fallback. The selectors are listed
// in the order they are tried.

const TITLE = ["h1#-job-card-title", "h1"];
const APPLY_CONTROLS = ["[data-apply-button-container] a[href*='/konkurs/']", "a[href*='poslovi.infostud.com/konkurs/']", "a[href*='/konkurs/']"];
// Last, by its words, in the job's own page and not in its header or footer.
const APPLY_WORDS = /^(konkurišite|konkurisite|apply)$/i;
const OUTSIDE_THE_JOB = "header, nav, footer, [role='navigation'], [role='banner']";

export const infostud: SiteAdapter = {
  source: "infostud",

  isJobPage(url) {
    return canonicalJobUrl(url.href)?.source === "infostud";
  },

  readJob(doc, url): ScrapedJob | null {
    const canonical = canonicalJobUrl(url.href);
    if (!canonical || canonical.source !== "infostud") return null;

    const lookup = lookUpPosting(doc, canonical.url);
    if (lookup.kind === "stale") return null;
    const details = lookup.kind === "found" ? detailsOf(lookup.posting) : { title: null, company: null, location: null };
    const heading = firstText(doc, TITLE);
    const title = details.title ?? (heading ? withoutCompanySuffix(heading, details.company) : null);
    if (!title) return null;
    return { url: canonical.url, title, company: details.company, location: details.location };
  },

  findApplyControl(doc) {
    const byWhatItIs = firstElement(doc, APPLY_CONTROLS);
    if (byWhatItIs) return byWhatItIs;

    const candidates = [...doc.querySelectorAll("a, button")];
    return candidates.find((element) => APPLY_WORDS.test(cleanText(element.textContent)) && !element.closest(OUTSIDE_THE_JOB)) ?? null;
  },
};
