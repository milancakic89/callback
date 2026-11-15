// @vitest-environment happy-dom
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addExternalApplication } = vi.hoisted(() => ({ addExternalApplication: vi.fn() }));

vi.mock("@/app/(app)/applications/actions", () => ({ addExternalApplication }));
// The upload button pulls in the server action; the form only needs it to exist.
vi.mock("@/app/(app)/profile/actions", () => ({ uploadCv: vi.fn() }));

import type { CandidateCv } from "@/lib/cvs/types";
import type { TrackQuery } from "@/lib/external-jobs/track-query";
import { AddExternalApplicationForm } from "./add-external-application-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JOB: TrackQuery = {
  source: "helloworld",
  url: "https://www.helloworld.rs/posao/Fullstack-Developer/Proximus-d.o.o/766944",
  title: "Fullstack Developer",
  company: "Proximus d.o.o.",
  location: "Belgrade",
};

const cv = (index: number): CandidateCv => ({
  id: `cv-${index}`,
  fileName: `cv-${index}.pdf`,
  sizeBytes: 120_000,
  createdAt: "2026-11-01T09:00:00+00:00",
  activeOn: [],
});

describe("AddExternalApplicationForm: what it shows", () => {
  const render = (job: TrackQuery, cvs: CandidateCv[]) => renderToStaticMarkup(createElement(AddExternalApplicationForm, { job, cvs }));

  it("prefills the title, company and location from the page, and shows the site and the job's link", () => {
    const html = render(JOB, []);

    expect(html).toContain('value="Fullstack Developer"');
    expect(html).toContain('value="Proximus d.o.o."');
    expect(html).toContain('value="Belgrade"');
    expect(html).toContain("Job on HelloWorld");
    expect(html).toContain(`href="${JOB.url}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("leaves a field the extension couldn't read empty, for the candidate to fill in", () => {
    const html = render({ ...JOB, company: null, location: null }, []);

    expect(html).toMatch(/id="company"[^>]*value=""|value=""[^>]*id="company"/);
    expect(html).toContain("required");
  });

  it("makes the title and company required and the location optional", () => {
    const html = render(JOB, []);

    expect(html).toMatch(/<input[^>]*id="title"[^>]*required/);
    expect(html).toMatch(/<input[^>]*id="company"[^>]*required/);
    expect(html).not.toMatch(/<input[^>]*id="location"[^>]*required/);
    expect(html).toContain("(optional)");
  });

  it("offers no CV, the CVs on the account, and an upload", () => {
    const html = render(JOB, [cv(1), cv(2)]);

    expect(html).toContain("No CV");
    expect(html).toContain("cv-1.pdf");
    expect(html).toContain("cv-2.pdf");
    expect(html).toContain("Upload a new CV");
  });

  it("preselects the CV when there is exactly one, and 'No CV' when there are several", () => {
    expect(render(JOB, [cv(1)])).toMatch(/name="cv"[^>]*checked=""[^>]*value="cv-1"/);
    expect(render(JOB, [cv(1), cv(2)])).toMatch(/name="cv"[^>]*checked=""[^>]*value=""/);
  });

  it("starts at Pending, and can be saved or cancelled", () => {
    const html = render(JOB, []);

    expect(html).toContain("Pending");
    expect(html).toContain('type="submit"');
    expect(html).toContain(">Save<");
    expect(html).toContain('href="/applications"');
  });

  it("shows the page's text as text", () => {
    const html = render({ ...JOB, title: '"><script>alert(1)</script>', company: "<img src=x onerror=alert(1)>" }, []);

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
  });
});

describe("AddExternalApplicationForm: saving", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    addExternalApplication.mockResolvedValue({});
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function show(job: TrackQuery, cvs: CandidateCv[]) {
    await act(async () => {
      root.render(createElement(AddExternalApplicationForm, { job, cvs }));
    });
  }

  async function submit() {
    const form = container.querySelector("form");
    if (!form) throw new Error("No form.");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  it("sends the address, the fields, the chosen CV and the status, and nothing else", async () => {
    await show(JOB, [cv(1)]);
    await submit();

    expect(addExternalApplication).toHaveBeenCalledOnce();
    const data = addExternalApplication.mock.calls[0][1] as FormData;
    expect(Object.fromEntries(data)).toEqual({
      url: JOB.url,
      title: "Fullstack Developer",
      company: "Proximus d.o.o.",
      location: "Belgrade",
      cvId: "cv-1",
      status: "PENDING",
    });
  });

  it("sends an empty CV when none is chosen", async () => {
    await show(JOB, [cv(1), cv(2)]);
    await submit();

    expect((addExternalApplication.mock.calls[0][1] as FormData).get("cvId")).toBe("");
  });

  it("shows the action's error, and keeps what was typed", async () => {
    addExternalApplication.mockResolvedValue({ error: "Already in your applications." });
    await show(JOB, []);
    await submit();

    expect(container.textContent).toContain("Already in your applications.");
    expect(container.querySelector<HTMLInputElement>("#title")?.value).toBe("Fullstack Developer");
  });

  it("shows a field's error under it", async () => {
    addExternalApplication.mockResolvedValue({ fieldErrors: { title: ["Enter the job title."] } });
    await show({ ...JOB, title: null }, []);
    await submit();

    expect(container.querySelector("#title-error")?.textContent).toBe("Enter the job title.");
    expect(container.querySelector("#title")?.getAttribute("aria-invalid")).toBe("true");
  });
});
