import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs/0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The actions pull in the server (Supabase, rate limiting); the dialog only needs them to exist.
vi.mock("@/app/jobs/[jobId]/actions", () => ({ applyToJob: vi.fn() }));
vi.mock("@/app/(app)/applications/actions", () => ({ withdrawMyApplication: vi.fn() }));
vi.mock("@/app/(app)/profile/actions", () => ({ uploadCv: vi.fn() }));

import type { CallbackApplication, CandidateCv } from "@/lib/cvs/types";
import { ApplyDialog } from "./apply-dialog";

const CV: CandidateCv = {
  id: "cv-1",
  fileName: "cv.pdf",
  sizeBytes: 120_000,
  createdAt: "2026-11-01T09:00:00+00:00",
  activeOn: [],
};

const APPLICATION: CallbackApplication = {
  id: "app-1",
  jobId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
  title: "Product Designer",
  companyName: "Acme",
  appliedAt: "2026-11-02T09:00:00+00:00",
  state: "active",
  cvFileName: "cv.pdf",
  coverLetter: null,
  status: { stage: "APPLIED", stepName: null, stepDescription: null, stageAt: null, stepUpdatedAt: null },
  interview: null,
};

const render = (application: CallbackApplication | null) =>
  renderToStaticMarkup(
    createElement(ApplyDialog, {
      jobId: "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f",
      jobTitle: "Product Designer",
      companyName: "Acme",
      cvs: [CV],
      initialName: "Ana Novak",
      initialLocation: "Novi Sad",
      application,
    }),
  );

describe("ApplyDialog", () => {
  it("offers Apply to a candidate who hasn't applied", () => {
    const html = render(null);

    expect(html).toContain("Apply with a CV from your account.");
    expect(html).toContain(">Apply<");
    expect(html).not.toContain("You applied on");
  });

  it("shows the candidate's application instead once they have applied", () => {
    const html = render(APPLICATION);

    expect(html).toContain("You applied on 2 Nov 2026");
    expect(html).toContain("CV: cv.pdf");
    expect(html).toContain("Withdraw");
    expect(html).not.toContain("Apply with a CV from your account.");
  });

  it("keeps the apply form closed until it is asked for", () => {
    expect(render(null)).not.toContain("Choose a CV");
  });

  it("offers no Withdraw once the application is withdrawn", () => {
    const html = render({ ...APPLICATION, state: "you_withdrew", cvFileName: null, status: null });

    expect(html).toContain("You withdrew your application.");
    expect(html).not.toContain("Withdraw</button>");
  });
});
