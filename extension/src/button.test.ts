// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTrackPath } from "../../src/lib/external-jobs/track-link";
import { BUTTON_LABEL, createButtonController, HOST_ATTRIBUTE } from "./button";
import type { ScrapedJob } from "./sites/types";

const ORIGIN = "https://callback.rs";
const JOB: ScrapedJob = {
  url: "https://www.linkedin.com/jobs/view/4463907148/",
  title: "Senior Software Developer",
  company: "JetBrains",
  location: "Belgrade, Serbia",
};

let apply: HTMLButtonElement;

function hosts(): Element[] {
  return [...document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)];
}

beforeEach(() => {
  document.body.innerHTML = '<main><div id="bar"><button id="apply">Apply</button><button id="save">Save</button></div></main>';
  apply = document.getElementById("apply") as HTMLButtonElement;
});

describe("the Add to Callback button", () => {
  it("is a link, right after the site's Apply control, to the page on callback.rs", () => {
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync(JOB, apply);

    const mounted = controller.current();
    expect(mounted?.mode).toBe("inline");
    expect(apply.nextElementSibling).toBe(mounted?.host);
    expect(mounted?.host.nextElementSibling?.id).toBe("save");
    expect(mounted?.link.tagName).toBe("A");
    expect(mounted?.link.textContent).toBe(BUTTON_LABEL);
    expect(mounted?.link.getAttribute("href")).toBe(new URL(buildTrackPath(JOB), ORIGIN).toString());
  });

  it("opens in a new tab without handing the page over", () => {
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync(JOB, apply);

    expect(controller.current()?.link.target).toBe("_blank");
    expect(controller.current()?.link.rel).toBe("noopener noreferrer");
  });

  it("carries the job in the link: the canonical address, the title, the company and the place", () => {
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync({ ...JOB, url: "https://www.linkedin.com/jobs/view/4463907148/" }, apply);

    const href = new URL(controller.current()?.link.getAttribute("href") ?? "");
    expect(href.origin).toBe(ORIGIN);
    expect(href.pathname).toBe("/applications/new");
    expect(Object.fromEntries(href.searchParams)).toEqual({
      url: JOB.url,
      title: "Senior Software Developer",
      company: "JetBrains",
      location: "Belgrade, Serbia",
    });
  });

  it("points to the origin it was given, such as a local server in a development build", () => {
    const controller = createButtonController({ document, origin: "http://localhost:3103" });

    controller.sync(JOB, apply);

    expect(controller.current()?.link.getAttribute("href")?.startsWith("http://localhost:3103/applications/new?")).toBe(true);
  });

  it("keeps the page's text as text: markup in a title can't become an element, or end the value", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    const title = `<script>window.hacked = true</script><img src=x onerror="window.hacked = true">&url=https://evil.rs`;

    controller.sync({ ...JOB, title, company: '"><b>Acme</b>' }, apply);

    const mounted = controller.current();
    expect(document.querySelectorAll("script, img, b")).toHaveLength(0);
    expect(mounted?.host.querySelector("script, img, b")).toBeNull();
    expect(mounted?.link.querySelector("script, img, b")).toBeNull();
    expect(mounted?.link.children).toHaveLength(0);
    expect(mounted?.link.textContent).toBe(BUTTON_LABEL);
    const query = new URL(mounted?.link.getAttribute("href") ?? "").searchParams;
    expect(query.get("title")).toBe(title);
    expect(query.get("company")).toBe('"><b>Acme</b>');
    expect(query.getAll("url")).toEqual([JOB.url]);
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it("is in a closed shadow root, which the page can't look into", () => {
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync(JOB, apply);

    const host = controller.current()?.host;
    expect(host?.shadowRoot).toBeNull();
    expect(host?.children).toHaveLength(0);
    expect(host?.textContent).toBe("");
  });

  it("is not seen by the site's own click handlers", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    let seenBySite = 0;
    document.getElementById("bar")?.addEventListener("click", () => (seenBySite += 1));
    controller.sync(JOB, apply);

    controller.current()?.host.dispatchEvent(new Event("click", { bubbles: true }));

    expect(seenBySite).toBe(0);
  });

  it("is not added twice by a second look at the same page", () => {
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync(JOB, apply);
    const first = controller.current()?.host;
    controller.sync({ ...JOB }, apply);
    controller.sync({ ...JOB }, apply);

    expect(hosts()).toHaveLength(1);
    expect(controller.current()?.host).toBe(first);
  });

  it("does not touch the page when nothing changed", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    controller.sync(JOB, apply);
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((batch) => records.push(...batch));
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });

    controller.sync({ ...JOB }, apply);

    expect(observer.takeRecords()).toEqual([]);
    expect(records).toEqual([]);
    observer.disconnect();
  });

  it("follows the job: the link changes with it, and the same element stays", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    controller.sync(JOB, apply);
    const host = controller.current()?.host;

    controller.sync({ ...JOB, url: "https://www.linkedin.com/jobs/view/4000000002/", title: "Another job", company: null, location: null }, apply);

    const query = new URL(controller.current()?.link.getAttribute("href") ?? "").searchParams;
    expect(query.get("url")).toBe("https://www.linkedin.com/jobs/view/4000000002/");
    expect(query.get("title")).toBe("Another job");
    expect(query.has("company")).toBe(false);
    expect(controller.current()?.host).toBe(host);
    expect(hosts()).toHaveLength(1);
  });

  it("is taken away when there is no job", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    controller.sync(JOB, apply);

    controller.sync(null, null);

    expect(hosts()).toHaveLength(0);
    expect(controller.current()).toBeNull();
  });

  it("is put back when the site's own scripts take it out, and is not duplicated", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    controller.sync(JOB, apply);
    controller.current()?.host.remove();

    controller.sync(JOB, apply);

    expect(hosts()).toHaveLength(1);
    expect(apply.nextElementSibling).toBe(controller.current()?.host);
  });

  it("moves to the new Apply control when the site draws another", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    controller.sync(JOB, apply);
    const another = document.createElement("button");
    another.id = "another";
    document.getElementById("bar")?.prepend(another);

    controller.sync(JOB, another);

    expect(another.nextElementSibling).toBe(controller.current()?.host);
    expect(hosts()).toHaveLength(1);
  });

  it("removes a button left in the page by an earlier run of the script before adding its own", () => {
    const leftover = document.createElement("div");
    leftover.setAttribute(HOST_ATTRIBUTE, "button");
    document.body.append(leftover);
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync(JOB, apply);

    expect(hosts()).toHaveLength(1);
    expect(hosts()[0]).not.toBe(leftover);
  });

  it("falls back to a pill at the corner of the page when the job is found but its Apply control isn't", () => {
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync(JOB, null);

    const mounted = controller.current();
    expect(mounted?.mode).toBe("pill");
    expect(mounted?.host.parentElement).toBe(document.body);
    expect(mounted?.host.getAttribute("data-mode")).toBe("pill");
    expect(mounted?.link.textContent).toBe(BUTTON_LABEL);
    expect(mounted?.link.getAttribute("href")).toBe(new URL(buildTrackPath(JOB), ORIGIN).toString());
  });

  it("goes from the pill to the Apply control's side once the control shows up, and back", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    controller.sync(JOB, null);
    expect(controller.current()?.mode).toBe("pill");

    controller.sync(JOB, apply);
    expect(controller.current()?.mode).toBe("inline");
    expect(apply.nextElementSibling).toBe(controller.current()?.host);
    expect(hosts()).toHaveLength(1);

    controller.sync(JOB, null);
    expect(controller.current()?.mode).toBe("pill");
    expect(hosts()).toHaveLength(1);
  });

  it("is not added for an address the server would refuse", () => {
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync({ ...JOB, url: "https://evil.example/jobs/view/4463907148/" }, apply);

    expect(hosts()).toHaveLength(0);
    expect(controller.current()).toBeNull();
  });

  it("removes the button it showed when the address turns out to be one it can't use", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    controller.sync(JOB, apply);

    controller.sync({ ...JOB, url: "javascript:alert(1)" }, apply);

    expect(hosts()).toHaveLength(0);
  });

  it("takes the Apply control's height", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    apply.getBoundingClientRect = () => ({ height: 44, width: 100, top: 0, left: 0, right: 100, bottom: 44, x: 0, y: 0, toJSON: () => ({}) });

    controller.sync(JOB, apply);

    expect(controller.current()?.host.style.getPropertyValue("--callback-button-height")).toBe("44px");
  });

  it("describes the job in the link's tooltip, as text", () => {
    const controller = createButtonController({ document, origin: ORIGIN });

    controller.sync(JOB, apply);

    expect(controller.current()?.link.title).toBe('Add "Senior Software Developer" at JetBrains to your Callback applications');

    controller.sync({ ...JOB, company: null }, apply);
    expect(controller.current()?.link.title).toBe('Add "Senior Software Developer" to your Callback applications');
  });

  it("is removed by destroy", () => {
    const controller = createButtonController({ document, origin: ORIGIN });
    controller.sync(JOB, apply);

    controller.destroy();

    expect(hosts()).toHaveLength(0);
    expect(controller.current()).toBeNull();
  });
});

describe("the button's styles", () => {
  let roots: ShadowRoot[];

  beforeEach(() => {
    roots = [];
    const attachShadow = HTMLElement.prototype.attachShadow;
    vi.spyOn(HTMLElement.prototype, "attachShadow").mockImplementation(function (this: HTMLElement, init: ShadowRootInit) {
      const root = attachShadow.call(this, init);
      roots.push(root);
      return root;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("is a constructed stylesheet, which a page's Content-Security-Policy doesn't block", () => {
    createButtonController({ document, origin: ORIGIN }).sync(JOB, apply);

    expect(roots).toHaveLength(1);
    expect(roots[0].adoptedStyleSheets).toHaveLength(1);
    expect(roots[0].querySelector("style")).toBeNull();
  });

  it("is a style element in a browser that has no constructed stylesheets", () => {
    const original = window.CSSStyleSheet;
    Object.defineProperty(window, "CSSStyleSheet", { value: undefined, configurable: true });
    try {
      createButtonController({ document, origin: ORIGIN }).sync(JOB, apply);
    } finally {
      Object.defineProperty(window, "CSSStyleSheet", { value: original, configurable: true });
    }

    expect(roots[0].querySelector("style")?.textContent).toContain("min-height");
  });
});
