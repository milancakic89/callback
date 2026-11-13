import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LegalSectionContent } from "@/components/legal/legal-document";
import type { LegalOperator } from "@/lib/legal/constants";

// For the legal texts' tests (features/legal-pages.md): an operator that is not the real one, so a test
// shows that a text reads its details from the prop, and the markup of one section's body.

export const TEST_OPERATOR: LegalOperator = {
  serviceName: "Callback",
  siteUrl: "https://example.test",
  operatorName: "Ana Test",
  operatorStatus: "a private person",
  country: "Freedonia",
  contactEmail: "privacy@example.test",
};

export function renderSection(section: LegalSectionContent): string {
  return renderToStaticMarkup(createElement(Fragment, null, section.body));
}

// React writes an apostrophe typed as &rsquo; as the character itself, so a test looking for a sentence
// writes it with this one.
export const APOSTROPHE = "’";
