// @vitest-environment happy-dom
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { removeExternalApplication, setApplicationStatus, setExternalApplicationStatus } = vi.hoisted(() => ({
  removeExternalApplication: vi.fn(),
  setApplicationStatus: vi.fn(),
  setExternalApplicationStatus: vi.fn(),
}));

vi.mock("@/app/(app)/applications/actions", () => ({ removeExternalApplication, setApplicationStatus, setExternalApplicationStatus }));

import type { ApplicationListItem, ExternalApplicationItem } from "@/lib/applications/types";
import { ApplicationsTable } from "./applications-table";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const external = (fields: Partial<ExternalApplicationItem> = {}): ExternalApplicationItem => ({
  kind: "external",
  id: "ext-1",
  source: "linkedin",
  status: "PENDING",
  appliedAt: "2026-11-03T09:00:00+00:00",
  title: "Data Engineer",
  companyName: "Gamma",
  location: "Belgrade",
  url: "https://www.linkedin.com/jobs/view/4463907148/",
  cvId: null,
  cvFileName: null,
  ...fields,
});

const manual: ApplicationListItem = {
  kind: "manual",
  jobId: "job-1",
  status: "PENDING",
  appliedAt: "2026-11-01T09:00:00+00:00",
  title: "Backend Engineer",
  companyName: "Beta",
  url: "https://example.com/job",
  active: true,
};

let container: HTMLDivElement;
let root: Root;

async function renderTable(items: ApplicationListItem[]) {
  await act(async () => {
    root.render(createElement(ApplicationsTable, { items }));
  });
}

function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((button) => button.getAttribute("aria-label")?.startsWith(label));
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === text);
}

function statusSelectOf(jobTitle: string): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`[aria-label='Status of "${jobTitle}"']`) ?? undefined;
}

function optionNamed(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) => element.textContent?.includes(name));
}

async function click(element: HTMLElement | undefined) {
  if (!element) throw new Error("Nothing to click.");
  await act(async () => {
    element.click();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("ApplicationsTable: a job added from another site", () => {
  it("is listed with the others", async () => {
    await renderTable([manual, external()]);

    expect(container.textContent).toContain("Data Engineer");
    expect(container.textContent).toContain("via LinkedIn");
    expect(container.textContent).toContain("Backend Engineer");
  });

  it("is removed after the confirmation: the row goes at once and the action is called with its id", async () => {
    removeExternalApplication.mockResolvedValue({ ok: true });
    await renderTable([manual, external()]);

    await click(buttonByLabel('Remove "Data Engineer"'));
    expect(document.body.textContent).toContain("Remove this job?");
    expect(removeExternalApplication).not.toHaveBeenCalled();

    await click(buttonByText("Yes, remove"));

    expect(removeExternalApplication).toHaveBeenCalledExactlyOnceWith("ext-1");
    expect(container.textContent).not.toContain("Data Engineer");
    expect(container.textContent).toContain("Backend Engineer");
  });

  it("stays when the confirmation is cancelled", async () => {
    await renderTable([external()]);

    await click(buttonByLabel('Remove "Data Engineer"'));
    await click(buttonByText("Cancel"));

    expect(removeExternalApplication).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Data Engineer");
  });

  it("comes back when the removal fails", async () => {
    removeExternalApplication.mockResolvedValue({ ok: false, error: "Could not remove. Try again." });
    await renderTable([external()]);

    await click(buttonByLabel('Remove "Data Engineer"'));
    await click(buttonByText("Yes, remove"));

    expect(removeExternalApplication).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Data Engineer");
    expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull();
  });

  it("changes status through its own action, shows it at once, and keeps it", async () => {
    setExternalApplicationStatus.mockResolvedValue({ ok: true });
    await renderTable([external()]);

    await click(statusSelectOf("Data Engineer"));
    await click(optionNamed("Got offer"));

    expect(setExternalApplicationStatus).toHaveBeenCalledExactlyOnceWith("ext-1", "OFFER");
    expect(setApplicationStatus).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Got offer");
  });

  it("puts the status back, with the error, when saving it fails", async () => {
    setExternalApplicationStatus.mockResolvedValue({ ok: false, error: "Application not found." });
    await renderTable([external()]);

    await click(statusSelectOf("Data Engineer"));
    await click(optionNamed("Rejected"));

    expect(setExternalApplicationStatus).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Pending");
    expect(container.textContent).not.toContain("Rejected");
    expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull();
  });

  it("offers no Remove on the other kinds of row", async () => {
    await renderTable([manual]);

    expect(buttonByLabel("Remove")).toBeUndefined();
  });
});
