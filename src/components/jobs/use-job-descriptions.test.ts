import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FetchJson } from "@/lib/jobs/load";
import type { JobListItem } from "@/lib/jobs/types";
import { useDescriptionBundle, useJobDescription } from "./use-job-descriptions";

const JOB: JobListItem = {
  id: "greenhouse:42",
  title: "Backend Engineer",
  companyName: "Elsewhere",
  locationRaw: null,
  department: null,
  workMode: null,
  postedAt: null,
  firstSeenAt: "2026-11-01T00:00:00.000Z",
  url: null,
  source: "greenhouse",
  active: true,
};

// Prints what a hook answers on its first render, which is all a render on the server can show.
function firstRender<Answer>(useHook: () => Answer): Answer {
  function Probe() {
    return createElement("p", null, JSON.stringify(useHook()));
  }
  return JSON.parse(renderToStaticMarkup(createElement(Probe)).replace(/<\/?p>/g, "").replaceAll("&quot;", '"'));
}

describe("useDescriptionBundle", () => {
  it("is idle, and fetches nothing, while no filter looks at the description", () => {
    const fetchJson = vi.fn();

    const answer = firstRender(() => {
      const { descriptions, status } = useDescriptionBundle(fetchJson, false);
      return { descriptions, status };
    });

    expect(answer).toEqual({ descriptions: null, status: "idle" });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("is loading from the first render once a filter needs the descriptions", () => {
    const fetchJson = vi.fn();

    const answer = firstRender(() => {
      const { descriptions, status } = useDescriptionBundle(fetchJson, true);
      return { descriptions, status };
    });

    expect(answer).toEqual({ descriptions: null, status: "loading" });
  });
});

describe("useJobDescription", () => {
  const noBundle = { descriptions: null };

  it("has nothing to show while no sheet is open", () => {
    const fetchJson = vi.fn();

    const answer = firstRender(() => {
      const { description, status } = useJobDescription(fetchJson, null, noBundle);
      return { description: description ?? null, status };
    });

    expect(answer).toEqual({ description: null, status: "ready" });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("is loading when a sheet opens on a job whose description hasn't been fetched", () => {
    const fetchJson: FetchJson = vi.fn();

    const answer = firstRender(() => {
      const { description, status } = useJobDescription(fetchJson, JOB, noBundle);
      return { description: description ?? null, status };
    });

    expect(answer).toEqual({ description: null, status: "loading" });
  });

  it("takes the text from the bundle when it is there, with nothing to fetch", () => {
    const fetchJson = vi.fn();
    const bundle = { descriptions: { "greenhouse:42": "From the bundle." } };

    const answer = firstRender(() => {
      const { description, status } = useJobDescription(fetchJson, JOB, bundle);
      return { description: description ?? null, status };
    });

    expect(answer).toEqual({ description: "From the bundle.", status: "ready" });
  });

  it("says a job the bundle has no text for has none, rather than loading", () => {
    const fetchJson = vi.fn();

    const answer = firstRender(() => {
      const { description, status } = useJobDescription(fetchJson, JOB, { descriptions: {} });
      return { description: description ?? null, status };
    });

    expect(answer).toEqual({ description: null, status: "ready" });
  });
});
