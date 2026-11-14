import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PROMO_VIDEO_FILES } from "./promo-video-files";

const PUBLIC_DIRECTORY = path.join(process.cwd(), "public");

function publicPathOf(servedPath: string): string {
  return path.join(PUBLIC_DIRECTORY, servedPath);
}

describe("the promo film's files", () => {
  it("are served from /videos/, as paths of their own", () => {
    const servedPaths = Object.values(PROMO_VIDEO_FILES);
    expect(new Set(servedPaths).size).toBe(servedPaths.length);
    for (const servedPath of servedPaths) expect(servedPath).toMatch(/^\/videos\/[a-z0-9.-]+$/);
  });

  // A renamed or missing file fails here, not on the page.
  it.each(Object.entries(PROMO_VIDEO_FILES))("has the %s file under public/", async (_name, servedPath) => {
    const file = await stat(publicPathOf(servedPath));
    expect(file.isFile()).toBe(true);
    expect(file.size).toBeGreaterThan(0);
  });

  it("has an MP4 for the video", async () => {
    // An MP4 starts with the box length and then "ftyp".
    const start = (await readFile(publicPathOf(PROMO_VIDEO_FILES.video))).subarray(4, 8).toString("ascii");
    expect(PROMO_VIDEO_FILES.video).toMatch(/\.mp4$/);
    expect(start).toBe("ftyp");
  });

  it("has a 16:9 WebP for the poster, as the player's box is", async () => {
    const { format, width, height } = await sharp(publicPathOf(PROMO_VIDEO_FILES.poster)).metadata();
    expect(format).toBe("webp");
    expect(width).toBe(1920);
    expect(height).toBe(1080);
  });

  it("has WebVTT for the captions, with the domain written as a domain", async () => {
    const captions = await readFile(publicPathOf(PROMO_VIDEO_FILES.captions), "utf8");
    expect(PROMO_VIDEO_FILES.captions).toMatch(/\.vtt$/);
    expect(captions.startsWith("WEBVTT\n")).toBe(true);
    const cueTimings = captions.match(/^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}$/gm) ?? [];
    expect(cueTimings.length).toBeGreaterThan(0);
    // The domain is written as a domain, not as it is spoken.
    expect(captions).toContain("at callback.rs.");
    expect(captions).not.toContain("callback dot R S");
  });
});
