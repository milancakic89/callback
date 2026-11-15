import { canonicalJobUrl } from "../../../src/lib/external-jobs/canonical-url";
import { cleanText, firstElement, firstText, orNull } from "../dom";
import { detailsOf, lookUpPosting } from "../job-posting";
import type { ScrapedJob, SiteAdapter } from "./types";

// HelloWorld: a job's page, /posao/{title}/{company}/{id}. The job's data is its JSON-LD JobPosting; the
// page's own heading is the fallback. The selectors are listed in the order they are tried.

const TITLE = ["h1 span", "h1"];
const COMPANY = [".__ga4_job_header_company"];
// The job's own apply control, by what it is: a link to /konkurs/{id}. The words on it change with the
// language of the page ("Prijavi se", "Apply Here").
const APPLY_CONTROLS = ["a.__ec-job-apply-button", "a.apply-btn", "a[href^='/konkurs/']", "a[href*='helloworld.rs/konkurs/']"];
// Last, by its words, inside the job's own page. The header's "Prijavi se" is a link to the login page
// (/prijava), in the header or a menu, and is never the apply control.
const APPLY_WORDS = /^(prijavi se|apply here|apply)$/i;
const OUTSIDE_THE_JOB = "header, nav, footer, [role='navigation'], [role='banner']";

function isLoginLink(element: Element): boolean {
  return (element.getAttribute("href") ?? "").includes("/prijava");
}

export const helloworld: SiteAdapter = {
  source: "helloworld",

  isJobPage(url) {
    return canonicalJobUrl(url.href)?.source === "helloworld";
  },

  readJob(doc, url): ScrapedJob | null {
    const canonical = canonicalJobUrl(url.href);
    if (!canonical || canonical.source !== "helloworld") return null;

    const lookup = lookUpPosting(doc, canonical.url);
    if (lookup.kind === "stale") return null;
    const details = lookup.kind === "found" ? detailsOf(lookup.posting) : { title: null, company: null, location: null };
    const title = details.title ?? firstText(doc, TITLE);
    if (!title) return null;
    return {
      url: canonical.url,
      title,
      company: details.company ?? orNull(firstText(doc, COMPANY)),
      location: details.location,
    };
  },

  findApplyControl(doc) {
    const byWhatItIs = firstElement(doc, APPLY_CONTROLS);
    if (byWhatItIs && !isLoginLink(byWhatItIs)) return byWhatItIs;

    const candidates = [...doc.querySelectorAll("a, button")];
    return (
      candidates.find(
        (element) => APPLY_WORDS.test(cleanText(element.textContent)) && !isLoginLink(element) && !element.closest(OUTSIDE_THE_JOB),
      ) ?? null
    );
  },
};
