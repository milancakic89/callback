import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useAppliedJobs } from "./use-applied-jobs";

function firstRender<Answer>(useHook: () => Answer): Answer {
  function Probe() {
    return createElement("p", null, JSON.stringify(useHook()));
  }
  return JSON.parse(renderToStaticMarkup(createElement(Probe)).replace(/<\/?p>/g, "").replaceAll("&quot;", '"'));
}

describe("useAppliedJobs", () => {
  it("starts from the ids the page was rendered with, with nothing pending and no dialog open", () => {
    const markApplied = vi.fn();
    const initialAppliedIds = ["greenhouse:1", "greenhouse:2"];

    const answer = firstRender(() => {
      const applied = useAppliedJobs(initialAppliedIds, markApplied);
      return {
        appliedIds: [...applied.appliedIds],
        pendingAppliedId: applied.pendingAppliedId,
        appliedErrors: applied.appliedErrors,
        confirmingJob: applied.confirmingJob,
      };
    });

    expect(answer).toEqual({
      appliedIds: ["greenhouse:1", "greenhouse:2"],
      pendingAppliedId: null,
      appliedErrors: {},
      confirmingJob: null,
    });
    expect(markApplied).not.toHaveBeenCalled();
  });
});
