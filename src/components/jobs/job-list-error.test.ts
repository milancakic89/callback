import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JobListError } from "./job-list-error";

describe("JobListError", () => {
  it("tells the visitor the list didn't load, as an alert, with a Retry button", () => {
    const html = renderToStaticMarkup(createElement(JobListError, { onRetry: vi.fn() }));

    expect(html).toContain('role="alert"');
    expect(html).toContain("Couldn&#x27;t load the job list.");
    expect(html).toContain("Retry");
  });
});
