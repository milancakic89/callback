import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPngSize } from "../../scripts/app-icons/png-size";

// The icons Next picks up by file name (favicon.ico, icon.png, apple-icon.png), made by `npm run icons`.
const readAppFile = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)));

const ICO_HEADER_BYTES = 6;
const ICO_ENTRY_BYTES = 16;

describe("favicon.ico", () => {
  const icon = readAppFile("./favicon.ico");

  it("is an icon file with three images", () => {
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    expect(icon.readUInt16LE(4)).toBe(3);
  });

  it("holds a 16, a 32 and a 48 px PNG, each where its entry says", () => {
    const sizes = [0, 1, 2].map((index) => {
      const entryStart = ICO_HEADER_BYTES + index * ICO_ENTRY_BYTES;
      const length = icon.readUInt32LE(entryStart + 8);
      const offset = icon.readUInt32LE(entryStart + 12);
      const { width, height } = readPngSize(icon.subarray(offset, offset + length));
      expect(icon.readUInt8(entryStart)).toBe(width);
      expect(icon.readUInt8(entryStart + 1)).toBe(height);
      return `${width}x${height}`;
    });

    expect(sizes).toEqual(["16x16", "32x32", "48x48"]);
  });
});

describe("icon.png", () => {
  it("is 192 by 192", () => {
    expect(readPngSize(readAppFile("./icon.png"))).toEqual({ width: 192, height: 192 });
  });
});

describe("apple-icon.png", () => {
  it("is 180 by 180", () => {
    expect(readPngSize(readAppFile("./apple-icon.png"))).toEqual({ width: 180, height: 180 });
  });
});
