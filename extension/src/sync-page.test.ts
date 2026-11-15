// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { buildTrackPath } from "../../src/lib/external-jobs/track-link";
import { type ButtonController, createButtonController, HOST_ATTRIBUTE } from "./button";
import { linkedin } from "./sites/linkedin";
import type { SiteAdapter } from "./sites/types";
import { documentFrom, loadFixture } from "./test-support/fixtures";
import { giveBox } from "./test-support/layout";
import { syncPage } from "./sync-page";

const URL_OF_JOB = new URL("https://www.helloworld.rs/posao/a/b/1");
const JOB = { url: "https://www.helloworld.rs/posao/a/b/1", title: "Engineer", company: "Acme", location: null };

function setup(adapterParts: Partial<SiteAdapter> = {}) {
  const apply = documentFrom("<body><a id='apply'>Apply</a></body>").querySelector("#apply");
  const sync = vi.fn();
  const adapter: SiteAdapter = {
    source: "helloworld",
    isJobPage: () => true,
    readJob: () => JOB,
    findApplyControl: () => apply,
    ...adapterParts,
  };
  const controller: ButtonController = { sync, current: () => null, destroy: vi.fn() };
  return { adapter, controller, sync, apply, document: documentFrom("<body></body>") };
}

describe("syncPage", () => {
  it("gives the controller the job and its apply control", () => {
    const { adapter, controller, sync, apply, document } = setup();

    syncPage({ adapter, controller, document, url: URL_OF_JOB });

    expect(sync).toHaveBeenCalledExactlyOnceWith(JOB, apply);
  });

  it("gives the job and no control when the site hasn't one, which the button turns into the corner pill", () => {
    const { adapter, controller, sync, document } = setup({ findApplyControl: () => null });

    syncPage({ adapter, controller, document, url: URL_OF_JOB });

    expect(sync).toHaveBeenCalledExactlyOnceWith(JOB, null);
  });

  it("takes the button away on a page that isn't a job's, without reading it", () => {
    const readJob = vi.fn();
    const { adapter, controller, sync, document } = setup({ isJobPage: () => false, readJob });

    syncPage({ adapter, controller, document, url: URL_OF_JOB });

    expect(sync).toHaveBeenCalledExactlyOnceWith(null, null);
    expect(readJob).not.toHaveBeenCalled();
  });

  it("takes the button away while the site hasn't shown the job, and doesn't look for the control", () => {
    const findApplyControl = vi.fn();
    const { adapter, controller, sync, document } = setup({ readJob: () => null, findApplyControl });

    syncPage({ adapter, controller, document, url: URL_OF_JOB });

    expect(sync).toHaveBeenCalledExactlyOnceWith(null, null);
    expect(findApplyControl).not.toHaveBeenCalled();
  });
});

describe("syncPage on LinkedIn's new jobs page", () => {
  const url = new URL("https://www.linkedin.com/jobs/search-results/?currentJobId=4472623882&keywords=x");
  const origin = "http://localhost:3000";

  it("mounts the button right after the first Easy Apply, to the job read from the tab's title", () => {
    const document = loadFixture("linkedin-signed-in-2026.html");
    const controller = createButtonController({ document, origin });
    const [firstEasyApply, secondEasyApply] = document.querySelectorAll('[aria-label="Easy Apply to this job"]');

    syncPage({ adapter: linkedin, controller, document, url });

    const mounted = controller.current();
    expect(mounted?.mode).toBe("inline");
    expect(firstEasyApply.nextElementSibling).toBe(mounted?.host);
    expect(secondEasyApply.nextElementSibling).toBeNull();
    expect(mounted?.link.getAttribute("href")).toBe(
      new URL(
        buildTrackPath({
          url: "https://www.linkedin.com/jobs/view/4472623882/",
          title: "Full Stack Software Developer",
          company: "Employer.com",
          location: null,
        }),
        origin,
      ).toString(),
    );
  });

  it("takes the button away when the member moves to a page that isn't a job's", () => {
    const document = loadFixture("linkedin-signed-in-2026.html");
    const controller = createButtonController({ document, origin });
    syncPage({ adapter: linkedin, controller, document, url });
    expect(controller.current()).not.toBeNull();

    syncPage({ adapter: linkedin, controller, document, url: new URL("https://www.linkedin.com/feed/") });

    expect(controller.current()).toBeNull();
    expect(document.querySelector(`[${HOST_ATTRIBUTE}]`)).toBeNull();
  });
});

describe("syncPage on LinkedIn's new jobs page, for a job applied for on the company's website", () => {
  const url = new URL("https://www.linkedin.com/jobs/search-results/?currentJobId=4431674043&keywords=x");
  const origin = "http://localhost:3000";

  function externalApplyPage() {
    const document = loadFixture("linkedin-signed-in-external-apply.html");
    const link = document.querySelector('a[aria-label="Apply on company website"]');
    const wrapper = link?.parentElement;
    const row = wrapper?.parentElement;
    const save = document.querySelector('[aria-label="Save the job"]');
    if (!link || !wrapper || !row || !save) throw new Error("the fixture lost its apply control, its wrapper, its row or its Save button");
    return { document, link, wrapper, row, save };
  }

  it("mounts the button after the wrapper, in the row with Apply and Save, and not inside the wrapper", () => {
    const { document, link, wrapper, row, save } = externalApplyPage();
    giveBox(link, 168, 48);
    giveBox(wrapper, 168, 48);
    giveBox(save, 80, 48);
    giveBox(row, 256, 48);
    const controller = createButtonController({ document, origin });

    syncPage({ adapter: linkedin, controller, document, url });

    const mounted = controller.current();
    expect(mounted?.mode).toBe("inline");
    expect(wrapper.nextElementSibling).toBe(mounted?.host);
    expect(mounted?.host.nextElementSibling).toBe(save);
    expect(wrapper.contains(mounted?.host ?? null)).toBe(false);
    expect(link.nextElementSibling).toBeNull();
    expect(mounted?.link.getAttribute("href")).toBe(
      new URL(
        buildTrackPath({
          url: "https://www.linkedin.com/jobs/view/4431674043/",
          title: "Frontend Engineer & UI Designer (Developer Tooling)",
          company: "SearchApi",
          location: null,
        }),
        origin,
      ).toString(),
    );
  });

  it("takes the wrapper's height, which is the link's", () => {
    const { document, link, wrapper, row } = externalApplyPage();
    giveBox(link, 168, 48);
    giveBox(wrapper, 168, 48);
    giveBox(row, 256, 48);
    const controller = createButtonController({ document, origin });

    syncPage({ adapter: linkedin, controller, document, url });

    expect(controller.current()?.host.style.getPropertyValue("--callback-button-height")).toBe("48px");
  });

  it("doesn't mount a second button on the next look, and keeps the first one in place", () => {
    const { document, link, wrapper, row } = externalApplyPage();
    giveBox(link, 168, 48);
    giveBox(wrapper, 168, 48);
    giveBox(row, 256, 48);
    const controller = createButtonController({ document, origin });

    syncPage({ adapter: linkedin, controller, document, url });
    const firstHost = controller.current()?.host;
    syncPage({ adapter: linkedin, controller, document, url });

    expect(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).toHaveLength(1);
    expect(controller.current()?.host).toBe(firstHost);
  });

  it("mounts it after the link where there is no layout, as before", () => {
    const { document, link } = externalApplyPage();
    const controller = createButtonController({ document, origin });

    syncPage({ adapter: linkedin, controller, document, url });

    expect(link.nextElementSibling).toBe(controller.current()?.host);
  });
});
