import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { STEP_DESCRIPTION_MAX, STEP_NAME_MAX, type StepDraft } from "@/lib/companies/candidate-steps";
import { CandidateStepFields } from "./candidate-step-row";

const draft = (fields: Partial<StepDraft> = {}): StepDraft => ({
  key: "k1",
  id: null,
  name: "Interview",
  description: "A short call.",
  schedulesInterview: false,
  locked: false,
  ...fields,
});

const render = (
  props: {
    draft?: StepDraft;
    index?: number;
    total?: number;
    nameErrors?: string[];
    descriptionErrors?: string[];
  } = {},
) =>
  renderToStaticMarkup(
    createElement(CandidateStepFields, {
      draft: props.draft ?? draft(),
      index: props.index ?? 0,
      total: props.total ?? 1,
      nameErrors: props.nameErrors,
      descriptionErrors: props.descriptionErrors,
      onChange: vi.fn(),
      onMove: vi.fn(),
      onRemove: vi.fn(),
    }),
  );

describe("CandidateStepFields", () => {
  it("has the name and the text the candidate sees, with their limits", () => {
    const html = render();

    expect(html).toContain('value="Interview"');
    expect(html).toContain("A short call.");
    expect(html).toContain(`maxLength="${STEP_NAME_MAX}"`);
    expect(html).toContain(`maxLength="${STEP_DESCRIPTION_MAX}"`);
    expect(html).toContain("What the candidate sees");
    expect(html).toContain(`13 / ${STEP_DESCRIPTION_MAX}`);
  });

  it("numbers the step from 1", () => {
    expect(render({ index: 2, total: 4 })).toContain("Step 3 name");
  });

  it("can't move the first step up or the last one down", () => {
    const first = render({ index: 0, total: 3 });
    expect(first).toMatch(/aria-label="Move step 1 up"[^>]*disabled=""|disabled=""[^>]*aria-label="Move step 1 up"/);
    expect(first).not.toMatch(/aria-label="Move step 1 down"[^>]*disabled=""/);

    const last = render({ index: 2, total: 3 });
    expect(last).toMatch(/aria-label="Move step 3 down"[^>]*disabled=""|disabled=""[^>]*aria-label="Move step 3 down"/);
  });

  it("can remove a step nobody has been on", () => {
    const html = render();

    expect(html).not.toMatch(/aria-label="Remove step 1"[^>]*disabled=""|disabled=""[^>]*aria-label="Remove step 1"/);
    expect(html).not.toContain("can&#x27;t be deleted");
  });

  it("can't remove a step that has been used, and says why", () => {
    const html = render({ draft: draft({ id: "x", locked: true }) });

    expect(html).toMatch(/aria-label="Remove step 1"[^>]*disabled=""|disabled=""[^>]*aria-label="Remove step 1"/);
    expect(html).toContain("An application has been on this step");
    expect(html).toContain("Rename it instead.");
  });

  it("shows the errors of each field", () => {
    const html = render({ nameErrors: ["Give the step a name."], descriptionErrors: ["Tell the candidate what this step means."] });

    expect(html).toContain("Give the step a name.");
    expect(html).toContain("Tell the candidate what this step means.");
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(2);
  });

  it("shows no error when there is none", () => {
    expect(render()).not.toContain('aria-invalid="true"');
  });
});
