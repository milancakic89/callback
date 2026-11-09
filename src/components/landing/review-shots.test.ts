import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  DESKTOP_SCALE,
  DESKTOP_VIEWPORT,
  MOBILE_SCALE,
  MOBILE_VIEWPORT,
  REVIEW_SHOTS,
  type ShotImage,
} from "./review-shots";

const PUBLIC_DIRECTORY = path.join(process.cwd(), "public");

const IMAGES: { name: string; image: ShotImage }[] = REVIEW_SHOTS.flatMap((shot) => [
  { name: `${shot.id} on a laptop`, image: shot.desktop },
  { name: `${shot.id} on a phone`, image: shot.mobile },
]);

describe("the Fast Manual Mode screenshots", () => {
  it("has one screenshot per id, each with its own label and caption", () => {
    for (const field of ["id", "label", "caption"] as const) {
      const values = REVIEW_SHOTS.map((shot) => shot[field]);
      expect(new Set(values).size).toBe(values.length);
      expect(values.every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("has a different file and a description for every image", () => {
    const sources = IMAGES.map(({ image }) => image.src);
    expect(new Set(sources).size).toBe(sources.length);
    for (const { image } of IMAGES) {
      expect(image.src).toMatch(/^\/landing\/[a-z-]+\.webp$/);
      expect(image.alt.trim().length).toBeGreaterThan(20);
    }
  });

  it("sizes the images as the capture script draws them", () => {
    for (const shot of REVIEW_SHOTS) {
      expect(shot.desktop.width).toBe(DESKTOP_VIEWPORT.width * DESKTOP_SCALE);
      expect(shot.desktop.height).toBe(DESKTOP_VIEWPORT.height * DESKTOP_SCALE);
      expect(shot.mobile.width).toBe(MOBILE_VIEWPORT.width * MOBILE_SCALE);
      expect(shot.mobile.height).toBe(MOBILE_VIEWPORT.height * MOBILE_SCALE);
    }
  });

  // The page gives next/image the sizes above, so a file of another size would be stretched.
  it.each(IMAGES)("has a webp file in public/ the size of its entry: $name", async ({ image }) => {
    const buffer = await readFile(path.join(PUBLIC_DIRECTORY, image.src));
    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(image.width);
    expect(metadata.height).toBe(image.height);
  });
});
