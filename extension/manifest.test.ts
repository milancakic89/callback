import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readPngSize } from "../scripts/app-icons/png-size";
import { EXTERNAL_SOURCE_HOSTS, EXTERNAL_SOURCES } from "../src/lib/external-jobs/sources";

type Manifest = {
  manifest_version: number;
  name: string;
  version: string;
  description: string;
  icons: Record<string, string>;
  content_scripts: { matches: string[]; js: string[]; run_at: string }[];
  [key: string]: unknown;
};

const extensionDirectory = import.meta.dirname;
const manifest = JSON.parse(readFileSync(path.join(extensionDirectory, "manifest.json"), "utf8")) as Manifest;

describe("the extension's manifest", () => {
  it("is Manifest V3, named Callback, with a description the store accepts", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("Callback");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  it("asks for no permission of any kind", () => {
    for (const key of [
      "permissions",
      "optional_permissions",
      "host_permissions",
      "optional_host_permissions",
      "background",
      "action",
      "options_page",
      "web_accessible_resources",
      "externally_connectable",
      "content_security_policy",
      "commands",
    ]) {
      expect(manifest, key).not.toHaveProperty(key);
    }
  });

  it("runs one content script, after the page has loaded, on exactly the three sites' hosts", () => {
    expect(manifest.content_scripts).toHaveLength(1);
    const [script] = manifest.content_scripts;
    expect(script.js).toEqual(["content.js"]);
    expect(script.run_at).toBe("document_idle");

    const hosts = script.matches.map((pattern) => {
      const match = pattern.match(/^https:\/\/([^/]+)\/.*$/);
      expect(match, pattern).not.toBeNull();
      return match?.[1];
    });
    expect(hosts.sort()).toEqual(EXTERNAL_SOURCES.map((source) => EXTERNAL_SOURCE_HOSTS[source]).sort());
  });

  it("matches LinkedIn on its whole host, which its single-page app needs, and the other two sites as before", () => {
    // A member moves from the feed to Jobs without a page load, and a script that matched only /jobs/*
    // would not be there; the adapter's isJobPage decides where a button appears.
    expect([...manifest.content_scripts[0].matches].sort()).toEqual([
      "https://poslovi.infostud.com/*",
      "https://www.helloworld.rs/*",
      "https://www.linkedin.com/*",
    ]);
    for (const pattern of manifest.content_scripts[0].matches) {
      expect(pattern.startsWith("https://"), pattern).toBe(true);
      expect(pattern, pattern).not.toContain("*.");
      expect(pattern, pattern).not.toContain("<all_urls>");
    }
  });

  it("has an icon at each size it names, and it is that size", () => {
    expect(Object.keys(manifest.icons).sort()).toEqual(["128", "16", "32", "48"]);
    for (const [size, file] of Object.entries(manifest.icons)) {
      const iconPath = path.join(extensionDirectory, file);
      expect(existsSync(iconPath), file).toBe(true);
      expect(readPngSize(new Uint8Array(readFileSync(iconPath))), file).toEqual({ width: Number(size), height: Number(size) });
    }
  });
});
