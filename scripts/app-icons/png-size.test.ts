import { describe, expect, it } from "vitest";
import { readPngSize } from "./png-size";

// The start of a PNG file: the signature, then an IHDR chunk (length 13) with the width and height.
function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

describe("readPngSize", () => {
  it("reads the width and the height from the IHDR chunk", () => {
    expect(readPngSize(pngHeader(192, 180))).toEqual({ width: 192, height: 180 });
    expect(readPngSize(pngHeader(1267, 1241))).toEqual({ width: 1267, height: 1241 });
  });

  it("reads a PNG that sits inside a larger buffer", () => {
    const container = Buffer.concat([Buffer.from([1, 2, 3]), pngHeader(48, 48)]);

    expect(readPngSize(container.subarray(3))).toEqual({ width: 48, height: 48 });
  });

  it("throws for a file that is not a PNG", () => {
    expect(() => readPngSize(Buffer.from("GIF89a, not a png at all, just text"))).toThrow("Not a PNG file.");
    expect(() => readPngSize(pngHeader(1, 1).subarray(0, 10))).toThrow("Not a PNG file.");
  });
});
