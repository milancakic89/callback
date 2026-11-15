import { externalSourceOfHost } from "../../../src/lib/external-jobs/sources";
import { helloworld } from "./helloworld";
import { infostud } from "./infostud";
import { linkedin } from "./linkedin";
import type { SiteAdapter } from "./types";

export const ADAPTERS: readonly SiteAdapter[] = [linkedin, helloworld, infostud];

// The adapter for the site the page is on, picked by its host, or null for any other.
export function adapterForHostname(hostname: string): SiteAdapter | null {
  const source = externalSourceOfHost(hostname);
  return ADAPTERS.find((adapter) => adapter.source === source) ?? null;
}
