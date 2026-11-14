import { describe, expect, it } from "vitest";
import { packIco } from "./ico";

// Stand-ins for PNG files: packIco only carries the bytes, it does not read them.
const smallPng = Buffer.from([1, 2, 3, 4, 5]);
const mediumPng = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80]);
const largePng = Buffer.from([200, 201, 202]);

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

describe("packIco", () => {
  const ico = packIco([
    { size: 16, png: smallPng },
    { size: 32, png: mediumPng },
    { size: 48, png: largePng },
  ]);

  it("starts with a header: reserved 0, type 1 (icon), and the number of images", () => {
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
  });

  it("has one directory entry per image, with its width, height and byte size", () => {
    const entries = [0, 1, 2].map((index) => {
      const entryStart = HEADER_BYTES + index * ENTRY_BYTES;
      return {
        width: ico.readUInt8(entryStart),
        height: ico.readUInt8(entryStart + 1),
        planes: ico.readUInt16LE(entryStart + 4),
        bitsPerPixel: ico.readUInt16LE(entryStart + 6),
        byteSize: ico.readUInt32LE(entryStart + 8),
      };
    });

    expect(entries).toEqual([
      { width: 16, height: 16, planes: 1, bitsPerPixel: 32, byteSize: 5 },
      { width: 32, height: 32, planes: 1, bitsPerPixel: 32, byteSize: 8 },
      { width: 48, height: 48, planes: 1, bitsPerPixel: 32, byteSize: 3 },
    ]);
  });

  it("points each entry's offset at that image's own bytes, which follow the directory in order", () => {
    const expectedPngs = [smallPng, mediumPng, largePng];

    expectedPngs.forEach((expectedPng, index) => {
      const entryStart = HEADER_BYTES + index * ENTRY_BYTES;
      const offset = ico.readUInt32LE(entryStart + 12);
      const byteSize = ico.readUInt32LE(entryStart + 8);

      expect(ico.subarray(offset, offset + byteSize)).toEqual(expectedPng);
    });
    expect(ico.readUInt32LE(HEADER_BYTES + 12)).toBe(HEADER_BYTES + 3 * ENTRY_BYTES);
    expect(ico.length).toBe(HEADER_BYTES + 3 * ENTRY_BYTES + 5 + 8 + 3);
  });

  it("writes a size of 256 as 0, which is how the format spells it", () => {
    const largest = packIco([{ size: 256, png: smallPng }]);

    expect(largest.readUInt8(HEADER_BYTES)).toBe(0);
    expect(largest.readUInt8(HEADER_BYTES + 1)).toBe(0);
  });

  it("refuses no images, and a size the format cannot hold", () => {
    expect(() => packIco([])).toThrow("at least one image");
    expect(() => packIco([{ size: 0, png: smallPng }])).toThrow("1 to 256");
    expect(() => packIco([{ size: 257, png: smallPng }])).toThrow("1 to 256");
    expect(() => packIco([{ size: 16.5, png: smallPng }])).toThrow("1 to 256");
  });
});
