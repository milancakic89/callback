// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { documentFrom, loadFixture } from "../test-support/fixtures";
import { giveBox } from "../test-support/layout";
import { linkedin } from "./linkedin";

const JOB_URL = "https://www.linkedin.com/jobs/view/4463907148/";
const TITLE = "Senior Software Developer (JCP Core Foundation Licensing and Quotation)";
const NEW_JOBS_PAGE_JOB_URL = "https://www.linkedin.com/jobs/view/4472623882/";
const NEW_JOBS_PAGE_URL = new URL("https://www.linkedin.com/jobs/search-results/?currentJobId=4472623882&keywords=x");

describe("the LinkedIn adapter: the signed-in job pane", () => {
  it("reads the title, company and place from the top card, with the address from the tab", () => {
    expect(linkedin.readJob(loadFixture("linkedin-signed-in-job.html"), new URL(`${JOB_URL}?refId=abc`))).toEqual({
      url: JOB_URL,
      title: TITLE,
      company: "JetBrains",
      location: "Belgrade, Serbia",
    });
  });

  it("reads the job open in the search from currentJobId", () => {
    const url = new URL("https://www.linkedin.com/jobs/search/?currentJobId=4463907148&keywords=engineer");

    expect(linkedin.readJob(loadFixture("linkedin-signed-in-job.html"), url)).toMatchObject({ url: JOB_URL, title: TITLE });
  });

  it("finds the apply control, and not the Save button beside it", () => {
    const control = linkedin.findApplyControl(loadFixture("linkedin-signed-in-job.html"));

    expect(control?.classList.contains("jobs-apply-button")).toBe(true);
    expect(control?.textContent).toContain("Easy Apply");
  });

  it("reads nothing while the pane still shows the job that was open before the address changed", () => {
    const doc = loadFixture("linkedin-signed-in-job.html");
    const nextJob = new URL("https://www.linkedin.com/jobs/search/?currentJobId=4000000002");

    expect(linkedin.readJob(doc, nextJob)).toBeNull();
  });

  it("reads the older top card, with its own class names", () => {
    expect(linkedin.readJob(loadFixture("linkedin-signed-in-legacy.html"), new URL("https://www.linkedin.com/jobs/view/4000000001/"))).toEqual({
      url: "https://www.linkedin.com/jobs/view/4000000001/",
      title: "Backend Engineer",
      company: "Acme",
      location: "Novi Sad, Serbia",
    });
    expect(linkedin.findApplyControl(loadFixture("linkedin-signed-in-legacy.html"))?.classList.contains("jobs-apply-button")).toBe(true);
  });

  it("falls back to the page's own title on a job's page when the top card's classes have all changed", () => {
    const doc = loadFixture("linkedin-signed-in-job.html");
    for (const element of doc.querySelectorAll('[class*="job-details-jobs-unified-top-card"]')) element.className = "renamed";

    expect(linkedin.readJob(doc, new URL(JOB_URL))).toEqual({
      url: JOB_URL,
      title: "Senior Software Developer",
      company: "JetBrains",
      location: null,
    });
  });

  it("falls back to the page's title in the search too, where it names the open job", () => {
    const doc = loadFixture("linkedin-signed-in-job.html");
    for (const element of doc.querySelectorAll('[class*="job-details-jobs-unified-top-card"]')) element.className = "renamed";

    expect(linkedin.readJob(doc, new URL("https://www.linkedin.com/jobs/search/?currentJobId=4463907148"))).toEqual({
      url: JOB_URL,
      title: "Senior Software Developer",
      company: "JetBrains",
      location: null,
    });
  });

  it("keeps markup in the page's text as text", () => {
    const doc = loadFixture("linkedin-signed-in-job.html");
    const heading = doc.querySelector(".job-details-jobs-unified-top-card__job-title a");
    if (heading) heading.textContent = "<script>alert(1)</script>";

    expect(linkedin.readJob(doc, new URL(JOB_URL))?.title).toBe("<script>alert(1)</script>");
  });
});

describe("the LinkedIn adapter: the public page", () => {
  it("reads the title, company and place from the top card", () => {
    expect(linkedin.readJob(loadFixture("linkedin-guest-job.html"), new URL(JOB_URL))).toEqual({
      url: JOB_URL,
      title: TITLE,
      company: "JetBrains",
      location: "Belgrade, Serbia",
    });
  });

  it("finds the Apply button of the top card", () => {
    const control = linkedin.findApplyControl(loadFixture("linkedin-guest-job.html"));

    expect(control?.tagName).toBe("BUTTON");
    expect(control?.textContent?.trim()).toBe("Apply");
  });

  it("takes the title of the open job, not of one in the 'similar jobs' list", () => {
    expect(linkedin.readJob(loadFixture("linkedin-guest-job.html"), new URL(JOB_URL))?.title).not.toContain("MAAS");
  });
});

describe("the LinkedIn adapter: the new jobs page, with hashed class names and no h1", () => {
  it("reads the job from the tab's title, with the address from the currentJobId", () => {
    expect(linkedin.readJob(loadFixture("linkedin-signed-in-2026.html"), NEW_JOBS_PAGE_URL)).toEqual({
      url: NEW_JOBS_PAGE_JOB_URL,
      title: "Full Stack Software Developer",
      company: "Employer.com",
      location: null,
    });
  });

  it("has none of the classes of the older top cards, so it is the tab's title that is read", () => {
    const doc = loadFixture("linkedin-signed-in-2026.html");

    expect(doc.querySelector("h1")).toBeNull();
    expect(doc.querySelector('[class*="top-card"], .jobs-apply-button')).toBeNull();
  });

  it("finds the first of the two Easy Apply controls by its label", () => {
    const doc = loadFixture("linkedin-signed-in-2026.html");
    const [firstEasyApply, secondEasyApply] = doc.querySelectorAll('[aria-label="Easy Apply to this job"]');

    expect(secondEasyApply).toBeDefined();
    expect(linkedin.findApplyControl(doc)).toBe(firstEasyApply);
  });

  it("reads the tab's title of a job open in the recommendations too, with the notifications count in front of it", () => {
    const doc = loadFixture("linkedin-signed-in-2026.html");
    doc.title = "(12) Full Stack Software Developer | Employer.com | LinkedIn";

    expect(linkedin.readJob(doc, new URL("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4472623882"))).toMatchObject({
      url: NEW_JOBS_PAGE_JOB_URL,
      title: "Full Stack Software Developer",
      company: "Employer.com",
    });
  });

  it("reads no job while the tab's title is another page's: not three parts ending in LinkedIn", () => {
    const doc = loadFixture("linkedin-signed-in-2026.html");

    for (const title of ["Jobs | LinkedIn", "(3) Jobs | LinkedIn", "Full Stack Software Developer | Employer.com", "LinkedIn", ""]) {
      doc.title = title;
      expect(linkedin.readJob(doc, NEW_JOBS_PAGE_URL), title).toBeNull();
    }
  });

  it("reads no job in the search without a job open, whatever the tab's title says", () => {
    const doc = loadFixture("linkedin-signed-in-2026.html");

    expect(linkedin.readJob(doc, new URL("https://www.linkedin.com/jobs/search-results/?keywords=x"))).toBeNull();
  });

  it("keeps markup in the tab's title as text", () => {
    const doc = loadFixture("linkedin-signed-in-2026.html");
    doc.title = "<img src=x onerror=alert(1)> | <b>Acme</b> | LinkedIn";

    expect(linkedin.readJob(doc, NEW_JOBS_PAGE_URL)).toMatchObject({ title: "<img src=x onerror=alert(1)>", company: "<b>Acme</b>" });
  });
});

describe("the LinkedIn adapter: finding the apply control by what it says", () => {
  it("takes the control with the apply button's id", () => {
    const doc = documentFrom('<body><button aria-label="Save the job">Save</button><button id="jobs-apply-button-id">Go</button></body>');

    expect(linkedin.findApplyControl(doc)?.id).toBe("jobs-apply-button-id");
  });

  it("takes an Easy Apply or an Apply control, in any case, a button or a link", () => {
    for (const label of [
      "Easy Apply to this job",
      "easy apply",
      "Apply on company website",
      "Apply to Full Stack Software Developer on company website",
      "APPLY NOW",
    ]) {
      const doc = documentFrom(`<body><button aria-label="Save the job">Save</button><a href="#" aria-label="${label}">x</a></body>`);

      expect(linkedin.findApplyControl(doc)?.getAttribute("aria-label"), label).toBe(label);
    }
  });

  it("takes the first of them in the page", () => {
    const doc = documentFrom(
      '<body><button aria-label="Easy Apply to this job" id="first">x</button><a href="#" aria-label="Apply on company website" id="second">x</a></body>',
    );

    expect(linkedin.findApplyControl(doc)?.id).toBe("first");
  });

  it("skips the search's filter controls that come before the job's apply control", () => {
    const doc = documentFrom(
      '<body><button aria-label="Apply current filter to show 1,234 results">Show results</button><button aria-label="Apply filters">x</button><button aria-label="Apply">x</button><button aria-label="Easy Apply to this job" id="job">x</button></body>',
    );

    expect(linkedin.findApplyControl(doc)?.id).toBe("job");
  });

  it("leaves out what only has the word in it, or has no label", () => {
    const doc = documentFrom(
      '<body><button aria-label="Save the job">Easy Apply</button><button aria-label="Applications">x</button><button aria-label="Reapply later">x</button><button>Apply</button><div aria-label="Apply">x</div></body>',
    );

    expect(linkedin.findApplyControl(doc)).toBeNull();
  });

  it("prefers the controls it knows by their classes", () => {
    const doc = documentFrom('<body><button aria-label="Easy Apply to this job">x</button><button class="jobs-apply-button">Easy Apply</button></body>');

    expect(linkedin.findApplyControl(doc)?.classList.contains("jobs-apply-button")).toBe(true);
  });

  it("never takes the Callback button, whose link is in a closed shadow root", () => {
    const doc = documentFrom("<body></body>");
    const host = doc.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "closed" });
    const link = doc.createElement("a");
    link.setAttribute("aria-label", "Apply with Callback");
    shadowRoot.append(link);
    doc.body.append(host);

    expect(linkedin.findApplyControl(doc)).toBeNull();
  });
});

describe("the LinkedIn adapter: a job applied for on the company's website, whose control is in a wrapper", () => {
  const externalApplyUrl = new URL("https://www.linkedin.com/jobs/search-results/?currentJobId=4431674043&keywords=x");

  function externalApplyPage() {
    const doc = loadFixture("linkedin-signed-in-external-apply.html");
    const control = doc.querySelector('a[aria-label="Apply on company website"]');
    const wrapper = control?.parentElement;
    const row = wrapper?.parentElement;
    const save = doc.querySelector('[aria-label="Save the job"]');
    if (!control || !wrapper || !row || !save) throw new Error("the fixture lost its apply control, its wrapper, its row or its Save button");
    return { doc, control, wrapper, row, save };
  }

  it("reads the job from the tab's title, with its ampersand and its parentheses", () => {
    expect(linkedin.readJob(externalApplyPage().doc, externalApplyUrl)).toEqual({
      url: "https://www.linkedin.com/jobs/view/4431674043/",
      title: "Frontend Engineer & UI Designer (Developer Tooling)",
      company: "SearchApi",
      location: null,
    });
  });

  it("has the facts the page showed: one apply link, to LinkedIn's redirect, inside a wrapper, and no top-card classes", () => {
    const { doc, control, wrapper } = externalApplyPage();

    expect(doc.querySelectorAll('[aria-label="Apply on company website"]')).toHaveLength(1);
    expect(control.tagName).toBe("A");
    expect(control.textContent?.trim()).toBe("Apply");
    expect(control.getAttribute("href")).toMatch(/^https:\/\/www\.linkedin\.com\/safety\/go\/\?url=/);
    expect(wrapper.children).toHaveLength(1);
    expect(doc.querySelector('[class*="top-card"], .jobs-apply-button, h1')).toBeNull();
  });

  it("finds the link itself where there is no layout, which is the old placement", () => {
    const { doc, control } = externalApplyPage();

    expect(linkedin.findApplyControl(doc)).toBe(control);
  });

  it("finds the wrapper of the link's size, not the link, and not the row with the Save button in it", () => {
    const { doc, control, wrapper, row, save } = externalApplyPage();
    giveBox(control, 168, 48);
    giveBox(wrapper, 168, 48);
    giveBox(save, 80, 48);
    giveBox(row, 256, 48);

    expect(linkedin.findApplyControl(doc)).toBe(wrapper);
  });

  it("finds the wrapper whichever way the control is found: by its class, its id or its label", () => {
    const controls = [
      '<a class="jobs-apply-button" href="#">Apply</a>',
      '<a id="jobs-apply-button-id" href="#">Apply</a>',
      '<a aria-label="Apply on company website" href="#">Apply</a>',
    ];
    for (const control of controls) {
      const doc = documentFrom(`<body><div id="row"><span id="wrapper">${control}</span><button aria-label="Save the job">Save</button></div></body>`);
      const link = doc.querySelector("a");
      const wrapper = doc.getElementById("wrapper");
      const row = doc.getElementById("row");
      if (!link || !wrapper || !row) throw new Error("the test page lost an element");
      giveBox(link, 168, 48);
      giveBox(wrapper, 168, 48);
      giveBox(row, 256, 48);

      expect(linkedin.findApplyControl(doc), control).toBe(wrapper);
    }
  });

  it("stays on the control when its parent is wider than it, as on the Easy Apply fixture", () => {
    const doc = loadFixture("linkedin-signed-in-2026.html");
    const easyApply = doc.querySelector('[aria-label="Easy Apply to this job"]');
    const parent = easyApply?.parentElement;
    if (!easyApply || !parent) throw new Error("the fixture lost its Easy Apply control");
    giveBox(easyApply, 82, 21);
    giveBox(parent, 620, 21);

    expect(linkedin.findApplyControl(doc)).toBe(easyApply);
  });
});

describe("the LinkedIn adapter: pages that aren't a job's", () => {
  it("is a job page on /jobs/view/{id} and on /jobs/ with a currentJobId, nowhere else", () => {
    for (const url of [
      JOB_URL,
      "https://www.linkedin.com/jobs/view/senior-engineer-at-acme-4463907148",
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4463907148",
      NEW_JOBS_PAGE_URL.href,
    ]) {
      expect(linkedin.isJobPage(new URL(url)), url).toBe(true);
    }
    for (const url of [
      "https://www.linkedin.com/jobs/",
      "https://www.linkedin.com/jobs/search/",
      "https://www.linkedin.com/feed/?currentJobId=4463907148",
      "https://www.linkedin.com/in/someone/",
      "https://www.linkedin.com/",
    ]) {
      expect(linkedin.isJobPage(new URL(url)), url).toBe(false);
    }
  });

  it("reads no job from a page that isn't a job's, whatever the document holds", () => {
    const doc = loadFixture("linkedin-signed-in-job.html");

    expect(linkedin.readJob(doc, new URL("https://www.linkedin.com/jobs/search/"))).toBeNull();
    expect(linkedin.readJob(doc, new URL("https://www.helloworld.rs/posao/a/b/1"))).toBeNull();
  });

  it("finds no job and no control in a page with none", () => {
    const doc = documentFrom("<html><body><main>Feed</main></body></html>");

    expect(linkedin.readJob(doc, new URL(JOB_URL))).toBeNull();
    expect(linkedin.findApplyControl(doc)).toBeNull();
  });

  it("doesn't take the site's header links for a job's", () => {
    const doc = loadFixture("linkedin-signed-in-job.html");

    expect(doc.querySelector("#global-nav")?.textContent).toContain("Jobs");
    expect(linkedin.findApplyControl(doc)?.closest("#global-nav")).toBeNull();
  });
});
