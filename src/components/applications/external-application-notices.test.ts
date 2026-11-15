import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AlreadyTracked, InvalidTrackLink } from "./external-application-notices";

describe("InvalidTrackLink", () => {
  it("says the link doesn't name a job we can add, and what does", () => {
    const html = renderToStaticMarkup(createElement(InvalidTrackLink));

    expect(html).toContain("This link doesn&#x27;t point to a job we can add");
    expect(html).toContain("LinkedIn, HelloWorld and Infostud");
  });

  it("leads back to the applications", () => {
    expect(renderToStaticMarkup(createElement(InvalidTrackLink))).toContain('href="/applications"');
  });
});

describe("AlreadyTracked", () => {
  const render = (status: "PENDING" | "OFFER") =>
    renderToStaticMarkup(createElement(AlreadyTracked, { title: "Data Engineer", companyName: "Gamma", status }));

  it("says the job is on the list, with its status as the dropdown words it", () => {
    expect(render("PENDING")).toContain("Already in your applications");
    expect(render("PENDING")).toContain("Data Engineer at Gamma is on your list.");
    expect(render("PENDING")).toContain("Pending");
    expect(render("OFFER")).toContain("Got offer");
  });

  it("leads back to the applications", () => {
    expect(render("PENDING")).toContain('href="/applications"');
  });

  it("shows the job's text as text", () => {
    const html = renderToStaticMarkup(
      createElement(AlreadyTracked, { title: "<script>alert(1)</script>", companyName: "Gamma", status: "PENDING" }),
    );

    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
