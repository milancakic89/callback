import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANONICAL_URL_PATTERNS, JOB_URL_MAX } from "./canonical-url";
import { EXTERNAL_SOURCES } from "./sources";
import { COMPANY_MAX, EXTERNAL_APPLICATIONS_MAX, LOCATION_MAX, TITLE_MAX } from "./track-link";

// The database refuses what the page would, because a candidate's own session can reach the table
// without the page (features/chrome-extension.md). The rules are written twice, in TypeScript and in
// SQL; this keeps the two from drifting apart.
const migration = readFileSync(new URL("../../../supabase/migrations/20261115120000_external_applications.sql", import.meta.url), "utf8");

describe("the external_applications migration", () => {
  it("allows exactly the three sources", () => {
    const sources = EXTERNAL_SOURCES.map((source) => `'${source}'`).join(", ");

    expect(migration).toContain(`check (source in (${sources}))`);
  });

  it("checks each source's address against the same pattern the code does", () => {
    for (const source of EXTERNAL_SOURCES) {
      expect(migration, source).toContain(`source = '${source}' and url ~ '${CANONICAL_URL_PATTERNS[source]}'`);
    }
  });

  it("limits the lengths to the same numbers", () => {
    expect(migration).toContain(`char_length(url) <= ${JOB_URL_MAX}`);
    expect(migration).toContain(`check (char_length(title) between 1 and ${TITLE_MAX})`);
    expect(migration).toContain(`check (char_length(company_name) between 1 and ${COMPANY_MAX})`);
    expect(migration).toContain(`check (char_length(location) between 1 and ${LOCATION_MAX})`);
  });

  it("holds a row to the candidate's own CV, which survives the CV's deletion", () => {
    expect(migration).toContain("add constraint candidate_cvs_id_user_key unique (id, user_id)");
    expect(migration).toContain("foreign key (cv_id, user_id) references public.candidate_cvs (id, user_id) on delete set null (cv_id)");
  });

  it("scopes every row to its owner and lets a client change only the status", () => {
    expect(migration).toContain("enable row level security");
    expect(migration.match(/user_id = \(select auth\.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain("grant update (status) on public.external_applications to authenticated");
    expect(migration).toContain(
      "grant insert (source, url, title, company_name, location, cv_id, status) on public.external_applications to authenticated",
    );
    expect(migration).not.toMatch(/grant (all|update)\s+on public\.external_applications/);
  });

  it("limits a candidate to the same number of rows, with errcode 54000", () => {
    expect(migration).toContain(`>= ${EXTERNAL_APPLICATIONS_MAX}`);
    expect(migration).toContain("errcode = '54000'");
  });
});
