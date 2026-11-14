import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPngSize } from "../../scripts/app-icons/png-size";
import manifest from "./manifest";

const PUBLIC_DIRECTORY = fileURLToPath(new URL("../../public/", import.meta.url));

describe("manifest", () => {
  const webManifest = manifest();
  const icons = webManifest.icons ?? [];

  it("names the app Callback and opens it at the root, in the browser", () => {
    expect(webManifest.name).toBe("Callback");
    expect(webManifest.short_name).toBe("Callback");
    expect(webManifest.description).toBe("Every application deserves a response.");
    expect(webManifest.start_url).toBe("/");
    expect(webManifest.scope).toBe("/");
    expect(webManifest.display).toBe("browser");
  });

  it("uses one colour for the splash screen and the theme", () => {
    expect(webManifest.background_color).toBe("#ffffff");
    expect(webManifest.theme_color).toBe("#ffffff");
  });

  it("has an icon for any use and a maskable one, at both 192 and 512", () => {
    const purposeAndSizes = icons.map((icon) => `${icon.purpose} ${icon.sizes}`);

    expect(purposeAndSizes).toEqual(expect.arrayContaining(["any 192x192", "any 512x512", "maskable 192x192", "maskable 512x512"]));
    expect(icons).toHaveLength(4);
    for (const icon of icons) expect(icon.type).toBe("image/png");
  });

  it.each(icons.map((icon) => [icon.src, icon.sizes] as const))(
    "points %s at a file under public/ that really is %s",
    (source, sizes) => {
      const { width, height } = readPngSize(readFileSync(`${PUBLIC_DIRECTORY}${source.replace(/^\//, "")}`));

      expect(`${width}x${height}`).toBe(sizes);
    },
  );
});
