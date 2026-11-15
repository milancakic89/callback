import { canonicalJobUrl } from "../../../src/lib/external-jobs/canonical-url";
import { cleanText, firstElement, firstElementByLabel, firstText, orNull, outermostSameBoxWrapper } from "../dom";
import type { ScrapedJob, SiteAdapter } from "./types";

// LinkedIn: a job open on its own page (/jobs/view/{id}/) or in the two-pane search and recommendations
// (?currentJobId={id}), as a signed-in member sees them, and the public page a visitor gets. The selectors
// are listed in the order they are tried: the current top card first, the older one after it. LinkedIn's
// newest jobs page (/jobs/search-results/?currentJobId={id}) has none of those classes, only hashed ones
// that change with every deploy, so there the job is read from the tab's title and the apply control from
// its label, which are words and not markup. The control is wrapped in an element of its own size, and the
// button goes after the wrapper (findApplyControl).

const SIGNED_IN_TITLE = [
  ".job-details-jobs-unified-top-card__job-title h1",
  ".job-details-jobs-unified-top-card__job-title",
  ".jobs-unified-top-card__job-title",
];
const SIGNED_IN_COMPANY = [
  ".job-details-jobs-unified-top-card__company-name a",
  ".job-details-jobs-unified-top-card__company-name",
  ".jobs-unified-top-card__company-name a",
  ".jobs-unified-top-card__company-name",
];
const SIGNED_IN_LOCATION = [
  ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
  ".job-details-jobs-unified-top-card__bullet",
  ".jobs-unified-top-card__bullet",
];
const GUEST_TITLE = ["h1.topcard__title", "h1.top-card-layout__title"];
const GUEST_COMPANY = [".topcard__org-name-link", ".topcard__flavor:not(.topcard__flavor--bullet)"];
const GUEST_LOCATION = [".topcard__flavor.topcard__flavor--bullet"];
const APPLY_CONTROLS = [
  ".jobs-apply-button",
  ".jobs-s-apply button",
  ".top-card-layout__cta-container .top-card-layout__cta",
  ".sign-up-modal__outlet",
  "#jobs-apply-button-id",
];
// Last, by what its label says: "Easy Apply to this job", "Apply to {job} on company website", "Apply on
// company website", "Apply now". Only a label that applies to the job: the search's filters come earlier
// in the page and say "Apply current filter to show 1,234 results" or a bare "Apply", and "Applications"
// and "Save the job" are not it either.
const APPLY_LABEL_CONTROLS = "button[aria-label], a[aria-label]";
const APPLY_LABEL = /^(?:easy\s+apply|apply\s+(?:to|on|now))\b/i;

// The numeric id in a LinkedIn job link, or null.
const JOB_ID_IN_LINK = /\/jobs\/view\/(?:[^/?#]*-)?(\d{5,20})/;

// The pane can still show the job that was open before when the address has already changed: a title
// that is a link to another job isn't this job's. The signed-in title is a link, inside its heading or
// around it; the public page's isn't, and is never in doubt.
function paneShowsAnotherJob(doc: Document, jobId: string): boolean {
  const title = firstElement(doc, SIGNED_IN_TITLE);
  const link = title?.closest("a") ?? title?.querySelector("a");
  const shownId = link?.getAttribute("href")?.match(JOB_ID_IN_LINK)?.[1];
  return Boolean(shownId && shownId !== jobId);
}

// The signed-in page's own title is "(3) Senior Developer | JetBrains | LinkedIn" while a job is open,
// on its own page and in the search alike; the number is the unread notifications. Used only when the
// top card's classes aren't there. A title of another page ("Jobs | LinkedIn") has fewer than three parts
// and is no job.
const DOCUMENT_TITLE = /^(?:\(\d+\)\s*)?(.+?) \| (.+?) \| LinkedIn$/;

function readFromDocumentTitle(doc: Document): { title: string; company: string } | null {
  const match = cleanText(doc.title).match(DOCUMENT_TITLE);
  return match ? { title: match[1], company: match[2] } : null;
}

export const linkedin: SiteAdapter = {
  source: "linkedin",

  isJobPage(url) {
    return url.pathname.startsWith("/jobs/") && canonicalJobUrl(url.href) !== null;
  },

  readJob(doc, url): ScrapedJob | null {
    const canonical = canonicalJobUrl(url.href);
    if (!canonical || canonical.source !== "linkedin") return null;
    const jobId = canonical.url.match(JOB_ID_IN_LINK)?.[1];
    if (!jobId || paneShowsAnotherJob(doc, jobId)) return null;

    const title = firstText(doc, SIGNED_IN_TITLE) ?? firstText(doc, GUEST_TITLE);
    if (title) {
      return {
        url: canonical.url,
        title,
        company: orNull(firstText(doc, SIGNED_IN_COMPANY) ?? firstText(doc, GUEST_COMPANY)),
        location: orNull(firstText(doc, SIGNED_IN_LOCATION) ?? firstText(doc, GUEST_LOCATION)),
      };
    }

    const fromTitle = readFromDocumentTitle(doc);
    return fromTitle ? { url: canonical.url, ...fromTitle, location: null } : null;
  },

  // LinkedIn wraps the control in an element of its own size that clips or stacks its children, so a button
  // put next to the control itself would be inside the wrapper and hidden: it goes after the wrapper.
  findApplyControl(doc) {
    const control = firstElement(doc, APPLY_CONTROLS) ?? firstElementByLabel(doc, APPLY_LABEL_CONTROLS, APPLY_LABEL);
    return control ? outermostSameBoxWrapper(control) : null;
  },
};
