import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useSavedJobs } from "./use-saved-jobs";

function firstRender<Answer>(useHook: () => Answer): Answer {
  function Probe() {
    return createElement("p", null, JSON.stringify(useHook()));
  }
  return JSON.parse(renderToStaticMarkup(createElement(Probe)).replace(/<\/?p>/g, "").replaceAll("&quot;", '"'));
}

describe("useSavedJobs", () => {
  it("starts from the ids the page was rendered with, with nothing pending", () => {
    const setSaved = vi.fn();
    const initialSavedIds = ["greenhouse:7"];

    const answer = firstRender(() => {
      const saved = useSavedJobs(initialSavedIds, setSaved);
      return {
        savedIds: [...saved.savedIds],
        pendingSavedIds: [...saved.pendingSavedIds],
        savedErrors: saved.savedErrors,
      };
    });

    expect(answer).toEqual({ savedIds: ["greenhouse:7"], pendingSavedIds: [], savedErrors: {} });
    expect(setSaved).not.toHaveBeenCalled();
  });
});
