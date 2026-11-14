// Takes the loose specks out of public/logoicon.png (features/app-icons.md). Removing that logo's
// background left blue specks around the mark and inside its counter; they must go before anything is
// resized, or they show at 512 px. The work is on a raw RGBA buffer, with its width and height passed
// in, so it can be tested on a small synthetic image without sharp or a file.

const CHANNELS = 4;
const ALPHA_CHANNEL = 3;

export type BoundingBox = { left: number; top: number; width: number; height: number };

export type CleanLogoOptions = {
  // A pixel at or above this alpha is "opaque", and takes part in finding the mark.
  opaqueAlphaThreshold: number;
  // A faint pixel (alpha above 0) this close to the mark, in pixels, is its anti-aliased edge and stays.
  edgeReachPixels: number;
};

export const DEFAULT_CLEAN_LOGO_OPTIONS: CleanLogoOptions = {
  opaqueAlphaThreshold: 128,
  edgeReachPixels: 2,
};

export type CleanedLogo = {
  // RGBA, the same size as the input. Everything that is not the mark or its edge is fully transparent.
  pixels: Uint8Array;
  // Of every pixel that is left (the mark and its edge).
  boundingBox: BoundingBox;
};

// The largest 8-connected region of the mask: a 1 at each of its pixels, and how many there are.
function findLargestRegion(mask: Uint8Array, width: number, height: number): { region: Uint8Array; size: number } {
  // The number of the region each pixel belongs to (regions count from 1; 0 is "none yet").
  const regionOfPixel = new Int32Array(mask.length);
  const pendingPixels = new Int32Array(mask.length);
  let largestRegionNumber = 0;
  let largestSize = 0;
  let regionCount = 0;

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || regionOfPixel[start] !== 0) continue;
    regionCount += 1;
    let pendingCount = 0;
    let regionSize = 0;
    pendingPixels[pendingCount++] = start;
    regionOfPixel[start] = regionCount;
    while (pendingCount > 0) {
      const pixel = pendingPixels[--pendingCount];
      regionSize += 1;
      const pixelX = pixel % width;
      const pixelY = (pixel - pixelX) / width;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const neighbourX = pixelX + offsetX;
          const neighbourY = pixelY + offsetY;
          if (neighbourX < 0 || neighbourY < 0 || neighbourX >= width || neighbourY >= height) continue;
          const neighbour = neighbourY * width + neighbourX;
          if (mask[neighbour] === 0 || regionOfPixel[neighbour] !== 0) continue;
          regionOfPixel[neighbour] = regionCount;
          pendingPixels[pendingCount++] = neighbour;
        }
      }
    }
    if (regionSize > largestSize) {
      largestSize = regionSize;
      largestRegionNumber = regionCount;
    }
  }

  const region = new Uint8Array(mask.length);
  if (largestRegionNumber !== 0) {
    for (let pixel = 0; pixel < region.length; pixel += 1) {
      if (regionOfPixel[pixel] === largestRegionNumber) region[pixel] = 1;
    }
  }
  return { region, size: largestSize };
}

// The mask grown by `reach` pixels in every direction (a square reach: a pixel counts when it is within
// `reach` columns and `reach` rows of the mask).
function growMask(mask: Uint8Array, width: number, height: number, reach: number): Uint8Array {
  const grownAcross = new Uint8Array(mask.length);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      for (let shift = -reach; shift <= reach; shift += 1) {
        const neighbourColumn = column + shift;
        if (neighbourColumn >= 0 && neighbourColumn < width && mask[row * width + neighbourColumn] === 1) {
          grownAcross[row * width + column] = 1;
          break;
        }
      }
    }
  }
  const grown = new Uint8Array(mask.length);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      for (let shift = -reach; shift <= reach; shift += 1) {
        const neighbourRow = row + shift;
        if (neighbourRow >= 0 && neighbourRow < height && grownAcross[neighbourRow * width + column] === 1) {
          grown[row * width + column] = 1;
          break;
        }
      }
    }
  }
  return grown;
}

// Keeps the mark (the largest region of opaque pixels) and the faint pixels within `edgeReachPixels` of
// it, which are its anti-aliased edge; every other pixel becomes fully transparent. Throws when the
// image has no opaque pixel, or when no single region holds more than half of them, which means the
// source is no longer one mark (two logos, or a mark that broke up) and cleaning it would delete half.
export function cleanLogo(
  rgba: Uint8Array,
  width: number,
  height: number,
  options: CleanLogoOptions = DEFAULT_CLEAN_LOGO_OPTIONS,
): CleanedLogo {
  if (rgba.length !== width * height * CHANNELS) {
    throw new Error(`Expected ${width * height * CHANNELS} bytes for a ${width}x${height} RGBA image, got ${rgba.length}.`);
  }

  const opaqueMask = new Uint8Array(width * height);
  let opaqueCount = 0;
  for (let pixel = 0; pixel < opaqueMask.length; pixel += 1) {
    if (rgba[pixel * CHANNELS + ALPHA_CHANNEL] >= options.opaqueAlphaThreshold) {
      opaqueMask[pixel] = 1;
      opaqueCount += 1;
    }
  }
  if (opaqueCount === 0) throw new Error("The logo has no opaque pixel.");

  const { region: mark, size: markSize } = findLargestRegion(opaqueMask, width, height);
  if (markSize * 2 <= opaqueCount) {
    throw new Error(
      `The largest region holds ${markSize} of ${opaqueCount} opaque pixels: the logo is no longer one mark.`,
    );
  }

  const nearMark = growMask(mark, width, height, options.edgeReachPixels);
  const pixels = new Uint8Array(rgba.length);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let pixel = 0; pixel < mark.length; pixel += 1) {
    const alpha = rgba[pixel * CHANNELS + ALPHA_CHANNEL];
    const kept = mark[pixel] === 1 || (nearMark[pixel] === 1 && alpha > 0);
    if (!kept) continue;
    pixels.set(rgba.subarray(pixel * CHANNELS, pixel * CHANNELS + CHANNELS), pixel * CHANNELS);
    const pixelX = pixel % width;
    const pixelY = (pixel - pixelX) / width;
    left = Math.min(left, pixelX);
    right = Math.max(right, pixelX);
    top = Math.min(top, pixelY);
    bottom = Math.max(bottom, pixelY);
  }

  return { pixels, boundingBox: { left, top, width: right - left + 1, height: bottom - top + 1 } };
}
