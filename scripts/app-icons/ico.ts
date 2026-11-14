// Packs PNG images into one .ico file, which is what src/app/favicon.ico is (features/app-icons.md).
// Since Windows Vista an ICO entry may hold a PNG file as it is, and every modern browser reads them, so
// nothing is converted: the entries are the PNG bytes, and the directory says where each one is.

const HEADER_BYTES = 6;
const DIRECTORY_ENTRY_BYTES = 16;
const ICO_TYPE_ICON = 1;
const BITS_PER_PIXEL = 32;
const LARGEST_ICO_SIZE = 256;

export type IcoImage = {
  // The side of the square image, 1 to 256 pixels.
  size: number;
  // A whole PNG file.
  png: Uint8Array;
};

// The ICO file for these images, in the order given. A size of 256 is written as 0, which is how the
// format spells it (its width and height are one byte each).
export function packIco(images: readonly IcoImage[]): Buffer {
  if (images.length === 0) throw new Error("An ICO needs at least one image.");
  for (const image of images) {
    if (!Number.isInteger(image.size) || image.size < 1 || image.size > LARGEST_ICO_SIZE) {
      throw new Error(`An ICO image is 1 to ${LARGEST_ICO_SIZE} pixels wide, got ${image.size}.`);
    }
  }

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(ICO_TYPE_ICON, 2);
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(DIRECTORY_ENTRY_BYTES * images.length);
  let imageOffset = HEADER_BYTES + DIRECTORY_ENTRY_BYTES * images.length;
  images.forEach((image, index) => {
    const entryStart = index * DIRECTORY_ENTRY_BYTES;
    const sizeByte = image.size === LARGEST_ICO_SIZE ? 0 : image.size;
    directory.writeUInt8(sizeByte, entryStart); // width
    directory.writeUInt8(sizeByte, entryStart + 1); // height
    directory.writeUInt8(0, entryStart + 2); // palette colours: none
    directory.writeUInt8(0, entryStart + 3); // reserved
    directory.writeUInt16LE(1, entryStart + 4); // colour planes
    directory.writeUInt16LE(BITS_PER_PIXEL, entryStart + 6);
    directory.writeUInt32LE(image.png.length, entryStart + 8);
    directory.writeUInt32LE(imageOffset, entryStart + 12);
    imageOffset += image.png.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.png)]);
}
