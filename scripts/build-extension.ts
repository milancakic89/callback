import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { PRODUCTION_ORIGIN, resolveOrigin, zipFileName } from "./extension/origin";

// Builds the Chrome extension (features/chrome-extension.md) into extension/dist, which is what is loaded
// unpacked and what the store is given:
//
//   npm run extension:build   the content script bundled into dist/content.js, with the manifest and icons
//   npm run extension:zip     the same for the store, and extension/callback-extension-<version>.zip
//
// The origin the button links to is compiled in from CALLBACK_ORIGIN (default https://callback.rs; for a
// development build, http://localhost:<port>), see scripts/extension/origin.ts. The store's zip refuses any
// other origin. The bundle is not minified: the store reviews what it is given, and it is a few KB.

async function readVersion(manifestPath: string): Promise<string> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string") throw new Error(`${manifestPath} has no version.`);
  return manifest.version;
}

async function main(): Promise<void> {
  const workingDirectory = process.cwd();
  const extensionDirectory = path.join(workingDirectory, "extension");
  const distDirectory = path.join(extensionDirectory, "dist");
  const wantsZip = process.argv.includes("--zip");

  const origin = resolveOrigin(process.env.CALLBACK_ORIGIN);
  if (wantsZip && origin !== PRODUCTION_ORIGIN) {
    throw new Error(`The store's zip is built for ${PRODUCTION_ORIGIN}, not ${origin}. Leave CALLBACK_ORIGIN unset.`);
  }

  await rm(distDirectory, { recursive: true, force: true });
  await mkdir(distDirectory, { recursive: true });

  await build({
    entryPoints: [path.join(extensionDirectory, "src", "content.ts")],
    outfile: path.join(distDirectory, "content.js"),
    bundle: true,
    format: "iife",
    target: "chrome120",
    platform: "browser",
    legalComments: "none",
    define: { __CALLBACK_ORIGIN__: JSON.stringify(origin) },
    tsconfig: path.join(workingDirectory, "tsconfig.json"),
    logLevel: "warning",
  });
  await cp(path.join(extensionDirectory, "manifest.json"), path.join(distDirectory, "manifest.json"));
  await cp(path.join(extensionDirectory, "icons"), path.join(distDirectory, "icons"), { recursive: true });
  console.log(`extension/dist built for ${origin}`);

  if (wantsZip) {
    const zipPath = path.join(extensionDirectory, zipFileName(await readVersion(path.join(extensionDirectory, "manifest.json"))));
    await rm(zipPath, { force: true });
    // The manifest has to be at the root of the zip, so zip from inside dist.
    execFileSync("zip", ["-r", "-X", "-q", zipPath, "."], { cwd: distDirectory });
    console.log(`${path.relative(workingDirectory, zipPath)} written`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
