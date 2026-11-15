import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The upload button pulls in the server action; the picker only needs it to exist.
vi.mock("@/app/(app)/profile/actions", () => ({ uploadCv: vi.fn() }));

import { MAX_CVS } from "@/lib/applications/apply-schema";
import type { CandidateCv } from "@/lib/cvs/types";
import { CvPicker } from "./cv-picker";

const cv = (index: number, fields: Partial<CandidateCv> = {}): CandidateCv => ({
  id: `cv-${index}`,
  fileName: `cv-${index}.pdf`,
  sizeBytes: 120_000,
  createdAt: "2026-11-01T09:00:00+00:00",
  activeOn: [],
  ...fields,
});

const render = (props: Partial<Parameters<typeof CvPicker>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(CvPicker, { cvs: [cv(1), cv(2)], value: "cv-1", onChange: vi.fn(), onUploaded: vi.fn(), onError: vi.fn(), ...props }),
  );

describe("CvPicker", () => {
  it("lists each CV as a radio button with its size and day, the chosen one checked", () => {
    const html = render();

    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("cv-1.pdf");
    expect(html).toContain("cv-2.pdf");
    expect(html).toContain("117 KB · Uploaded 1 Nov 2026");
    expect(html).toMatch(/value="cv-1"[^>]*checked|checked[^>]*value="cv-1"/);
    expect(html).not.toMatch(/value="cv-2"[^>]*checked|checked[^>]*value="cv-2"/);
  });

  it("offers an upload to add another CV", () => {
    expect(render()).toContain("Upload a new CV");
  });

  it("asks to upload the first CV when there is none, and shows no radio buttons", () => {
    const html = render({ cvs: [], value: null });

    expect(html).toContain("Upload your CV as a PDF, up to 5 MB.");
    expect(html).toContain("Upload your CV");
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain("No CV");
  });

  it("points to the account's CVs, in place of the upload, at the limit", () => {
    const html = render({ cvs: Array.from({ length: MAX_CVS }, (_, index) => cv(index)) });

    expect(html).toContain(`You have ${MAX_CVS} CVs.`);
    expect(html).toContain('href="/profile"');
    expect(html).not.toContain("Upload a new CV");
  });

  it("adds a 'No CV' choice, checked when nothing is chosen, only when allowed", () => {
    expect(render()).not.toContain("No CV");

    const html = render({ allowNone: true, value: null });
    expect(html).toContain("No CV");
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/value=""[^>]*checked|checked[^>]*value=""/);
  });

  it("still offers 'No CV' and an upload when there are no CVs and none is needed", () => {
    const html = render({ cvs: [], value: null, allowNone: true });

    expect(html).toContain("No CV");
    expect(html).toContain("Upload a new CV");
    expect(html.match(/type="radio"/g)).toHaveLength(1);
  });
});
