// The width and height a PNG file says it has, read from its IHDR chunk with no image library: the
// 8-byte signature, then the chunk's length and name (8 bytes), then width and height as 32-bit
// big-endian numbers. Throws for anything that is not a PNG.

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_NAME_OFFSET = 12;
const WIDTH_OFFSET = 16;
const HEIGHT_OFFSET = 20;
const IHDR_END = 24;

export function readPngSize(png: Uint8Array): { width: number; height: number } {
  const hasSignature = PNG_SIGNATURE.every((byte, index) => png[index] === byte);
  const headerName = Buffer.from(png.subarray(IHDR_NAME_OFFSET, IHDR_NAME_OFFSET + 4)).toString("latin1");
  if (png.length < IHDR_END || !hasSignature || headerName !== "IHDR") throw new Error("Not a PNG file.");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(WIDTH_OFFSET), height: view.getUint32(HEIGHT_OFFSET) };
}
