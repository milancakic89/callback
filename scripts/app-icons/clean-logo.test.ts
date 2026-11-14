import { describe, expect, it } from "vitest";
import { cleanLogo, type CleanLogoOptions } from "./clean-logo";

type Rgba = [number, number, number, number];

// An RGBA image whose every pixel is decided by `pixelAt`.
function makeImage(width: number, height: number, pixelAt: (x: number, y: number) => Rgba): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) pixels.set(pixelAt(x, y), (y * width + x) * 4);
  }
  return pixels;
}

const alphaAt = (pixels: Uint8Array, width: number, x: number, y: number) => pixels[(y * width + x) * 4 + 3];

const BLUE = (alpha: number): Rgba => [20, 60, 240, alpha];
const NOTHING: Rgba = [0, 0, 0, 0];

describe("cleanLogo", () => {
  describe("on a disc with soft edges and loose specks", () => {
    const size = 80;
    const centre = 40;
    const radius = 20;
    // Alpha falls from 255 to 0 across the two pixels at the rim, like an anti-aliased edge.
    const discAlpha = (x: number, y: number) => {
      const distance = Math.hypot(x - centre, y - centre);
      return Math.round(Math.min(255, Math.max(0, ((radius + 1 - distance) / 2) * 255)));
    };
    const specks = [
      { x: 3, y: 3, alpha: 255 },
      { x: 75, y: 6, alpha: 255 },
      { x: 5, y: 70, alpha: 60 },
      { x: 70, y: 70, alpha: 20 },
    ];
    const source = makeImage(size, size, (x, y) => {
      const speck = specks.find((candidate) => candidate.x === x && candidate.y === y);
      if (speck) return BLUE(speck.alpha);
      const alpha = discAlpha(x, y);
      return alpha > 0 ? BLUE(alpha) : NOTHING;
    });
    const cleaned = cleanLogo(source, size, size);

    it("removes the specks, opaque or faint", () => {
      for (const speck of specks) expect(alphaAt(cleaned.pixels, size, speck.x, speck.y)).toBe(0);
    });

    it("keeps the disc, its soft edge included, exactly as it was", () => {
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (specks.some((speck) => speck.x === x && speck.y === y)) continue;
          expect(Array.from(cleaned.pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4))).toEqual(
            Array.from(source.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)),
          );
        }
      }
      expect(alphaAt(cleaned.pixels, size, centre, centre)).toBe(255);
      const edgeAlphas = Array.from({ length: 4 }, (_, offset) => alphaAt(cleaned.pixels, size, centre + radius - 1 + offset, centre));
      expect(edgeAlphas.some((alpha) => alpha > 0 && alpha < 255)).toBe(true);
    });

    it("reports the disc's bounding box, edge included, and not the specks'", () => {
      // Alpha is above 0 wherever the distance from the centre is under radius + 1 (21), so 20 to 60.
      expect(cleaned.boundingBox).toEqual({ left: 20, top: 20, width: 41, height: 41 });
    });

    it("does not change the input", () => {
      expect(alphaAt(source, size, 3, 3)).toBe(255);
    });
  });

  describe("the reach of the anti-aliased edge", () => {
    // An opaque 4x4 block at 4..7, and faint pixels at 1, 2 and 3 columns away from it to the right.
    const width = 16;
    const source = makeImage(width, 12, (x, y) => {
      if (x >= 4 && x <= 7 && y >= 4 && y <= 7) return BLUE(255);
      if (y === 5 && (x === 9 || x === 10 || x === 11)) return BLUE(50);
      return NOTHING;
    });

    it("keeps a faint pixel within 2 pixels of the mark and removes one farther away", () => {
      const cleaned = cleanLogo(source, width, 12);

      expect(alphaAt(cleaned.pixels, width, 9, 5)).toBe(50);
      expect(alphaAt(cleaned.pixels, width, 10, 5)).toBe(0);
      expect(alphaAt(cleaned.pixels, width, 11, 5)).toBe(0);
    });

    it("takes the reach and the opaque threshold as options", () => {
      const wider: CleanLogoOptions = { opaqueAlphaThreshold: 128, edgeReachPixels: 3 };

      expect(alphaAt(cleanLogo(source, width, 12, wider).pixels, width, 10, 5)).toBe(50);
    });
  });

  describe("on an image that is not one mark", () => {
    it("throws for two blobs of the same size", () => {
      const source = makeImage(30, 10, (x, y) => (y >= 2 && y <= 7 && ((x >= 2 && x <= 7) || (x >= 20 && x <= 25)) ? BLUE(255) : NOTHING));

      expect(() => cleanLogo(source, 30, 10)).toThrow("no longer one mark");
    });

    it("throws for an image with nothing opaque in it", () => {
      expect(() => cleanLogo(makeImage(6, 6, () => BLUE(40)), 6, 6)).toThrow("no opaque pixel");
    });

    it("throws when the buffer does not fit the size it was given", () => {
      expect(() => cleanLogo(new Uint8Array(10), 4, 4)).toThrow("Expected 64 bytes");
    });
  });

  it("joins pixels that touch only at a corner into one region", () => {
    // Two 3x3 blocks that meet diagonally: one region, so nothing is removed and nothing throws.
    const source = makeImage(10, 10, (x, y) => {
      const inFirst = x >= 1 && x <= 3 && y >= 1 && y <= 3;
      const inSecond = x >= 4 && x <= 6 && y >= 4 && y <= 6;
      return inFirst || inSecond ? BLUE(255) : NOTHING;
    });

    const cleaned = cleanLogo(source, 10, 10);

    expect(cleaned.boundingBox).toEqual({ left: 1, top: 1, width: 6, height: 6 });
    expect(alphaAt(cleaned.pixels, 10, 2, 2)).toBe(255);
    expect(alphaAt(cleaned.pixels, 10, 5, 5)).toBe(255);
  });
});
