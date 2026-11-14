import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { cleanLogo, type BoundingBox } from "./app-icons/clean-logo";
import { packIco } from "./app-icons/ico";

// Makes every icon Callback has (features/app-icons.md) from public/logoicon.png: the browser tab's
// favicon.ico and icon.png and iOS's apple-icon.png (the three file conventions of src/app), and the
// four icons of the web manifest (public/icons/). The output is committed; the build does no image work.
// Run it again, `npm run icons`, whenever the logo changes.
//
//   npm run icons [-- --source <logo.png>] [-- --app-dir <dir>] [-- --icons-dir <dir>]
//
// The logo is cleaned of its specks first, cropped to the mark, and then placed, centred, at each icon's
// scale on a transparent or filled square. Every size is scaled (lanczos3) from the cleaned full-size
// mark, never from a smaller copy.

type Colour = { r: number; g: number; b: number };
type Paths = { source: string; appDirectory: string; iconsDirectory: string };

// The background of the icons that need one: apple-icon (iOS turns transparency black) and the
// maskable icons (Android crops them to the launcher's circle or squircle). White, because the
// blue-to-violet mark reads best on it; the landing page's dark, #09090b, is { r: 9, g: 9, b: 11 }.
const FILL_COLOUR: Colour = { r: 255, g: 255, b: 255 };

// How much of the square the mark's longer side takes (its bounding box, after cleaning).
const FAVICON_MARGIN_PIXELS = 1; // 16, 32 and 48 px: the mark fills the square, a pixel short of its edge
const TRANSPARENT_MARK_SCALE = 0.92; // icon.png, and the manifest's "any" icons
const APPLE_MARK_SCALE = 0.72; // on white; iOS rounds the corners itself
const MASKABLE_MARK_SCALE = 0.62; // inside the 80 % safe circle that Android's masks keep

const FAVICON_SIZES = [16, 32, 48];
const ICON_PNG_SIZE = 192;
const APPLE_ICON_SIZE = 180;
const MANIFEST_SIZES = [192, 512];

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const RGBA_CHANNELS = 4;

type CleanedMark = { pixels: Uint8Array; width: number; height: number; boundingBox: BoundingBox };

type IconLook = {
  size: number;
  // The mark's longer side as a fraction of the square.
  markScale: number;
  // The background colour, or null for a transparent one.
  fill: Colour | null;
};

// One square icon: the mark, cropped to its bounding box and scaled (lanczos3) from the full-size
// cleaned pixels, centred on a transparent or filled square, as the bytes of a PNG file.
async function renderIcon(mark: CleanedMark, look: IconLook): Promise<Buffer> {
  const { boundingBox } = mark;
  const longerSide = Math.max(boundingBox.width, boundingBox.height);
  const scale = (look.size * look.markScale) / longerSide;
  const markWidth = Math.max(1, Math.round(boundingBox.width * scale));
  const markHeight = Math.max(1, Math.round(boundingBox.height * scale));

  const scaledMark = await sharp(mark.pixels, { raw: { width: mark.width, height: mark.height, channels: RGBA_CHANNELS } })
    .extract(boundingBox)
    .resize({ width: markWidth, height: markHeight, fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();

  const left = Math.floor((look.size - markWidth) / 2);
  const top = Math.floor((look.size - markHeight) / 2);
  const onTransparentSquare = await sharp(scaledMark, {
    raw: { width: markWidth, height: markHeight, channels: RGBA_CHANNELS },
  })
    .extend({
      top,
      bottom: look.size - markHeight - top,
      left,
      right: look.size - markWidth - left,
      background: TRANSPARENT,
    })
    .raw()
    .toBuffer();

  // The fill goes on in a step of its own, over the whole square: sharp does a flatten before an extend,
  // so doing both in one pipeline would fill only the mark's own box. Flattening blends the mark's soft
  // edge with the background in one step, so there is no dark or light fringe from the transparent border.
  const square = sharp(onTransparentSquare, { raw: { width: look.size, height: look.size, channels: RGBA_CHANNELS } });
  const final = look.fill ? square.flatten({ background: look.fill }) : square;
  return final.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

type OutputFile = { path: string; description: string; bytes: Buffer };

// The favicon's look at one size: transparent, with a margin of a pixel. Not sharpened: tried at 16 and
// 32 px (sharp's sigma 0.5 to 1.2), it only washed the blue out and drew a halo.
function faviconLook(size: number): IconLook {
  return { size, markScale: (size - 2 * FAVICON_MARGIN_PIXELS) / size, fill: null };
}

async function buildOutputFiles(mark: CleanedMark, paths: Paths): Promise<OutputFile[]> {
  const files: OutputFile[] = [];

  const faviconImages = await Promise.all(
    FAVICON_SIZES.map(async (size) => ({ size, png: await renderIcon(mark, faviconLook(size)) })),
  );
  files.push({
    path: path.join(paths.appDirectory, "favicon.ico"),
    description: `ICO ${FAVICON_SIZES.join("+")}, transparent`,
    bytes: packIco(faviconImages),
  });

  files.push({
    path: path.join(paths.appDirectory, "icon.png"),
    description: `${ICON_PNG_SIZE}x${ICON_PNG_SIZE}, transparent`,
    bytes: await renderIcon(mark, { size: ICON_PNG_SIZE, markScale: TRANSPARENT_MARK_SCALE, fill: null }),
  });
  files.push({
    path: path.join(paths.appDirectory, "apple-icon.png"),
    description: `${APPLE_ICON_SIZE}x${APPLE_ICON_SIZE}, filled`,
    bytes: await renderIcon(mark, { size: APPLE_ICON_SIZE, markScale: APPLE_MARK_SCALE, fill: FILL_COLOUR }),
  });

  for (const size of MANIFEST_SIZES) {
    files.push({
      path: path.join(paths.iconsDirectory, `icon-${size}.png`),
      description: `${size}x${size}, transparent (any)`,
      bytes: await renderIcon(mark, { size, markScale: TRANSPARENT_MARK_SCALE, fill: null }),
    });
    files.push({
      path: path.join(paths.iconsDirectory, `icon-maskable-${size}.png`),
      description: `${size}x${size}, filled, full bleed (maskable)`,
      bytes: await renderIcon(mark, { size, markScale: MASKABLE_MARK_SCALE, fill: FILL_COLOUR }),
    });
  }
  return files;
}

// `--source`, `--app-dir` and `--icons-dir`, each followed by a path; whatever is missing keeps its default.
function parseArguments(argumentList: readonly string[], defaults: Paths): Paths {
  const flagToKey: Record<string, keyof Paths> = {
    "--source": "source",
    "--app-dir": "appDirectory",
    "--icons-dir": "iconsDirectory",
  };
  const paths = { ...defaults };
  for (let index = 0; index < argumentList.length; index += 2) {
    const key = flagToKey[argumentList[index]];
    const value = argumentList[index + 1];
    if (!key || !value) {
      throw new Error(`Unexpected argument "${argumentList[index]}". Use: ${Object.keys(flagToKey).join(" <path> ")} <path>.`);
    }
    paths[key] = path.resolve(value);
  }
  return paths;
}

async function main(): Promise<void> {
  const workingDirectory = process.cwd();
  const paths = parseArguments(process.argv.slice(2), {
    source: path.join(workingDirectory, "public", "logoicon.png"),
    appDirectory: path.join(workingDirectory, "src", "app"),
    iconsDirectory: path.join(workingDirectory, "public", "icons"),
  });

  const { data, info } = await sharp(paths.source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cleaned = cleanLogo(data, info.width, info.height);
  const mark: CleanedMark = { pixels: cleaned.pixels, width: info.width, height: info.height, boundingBox: cleaned.boundingBox };
  console.log(
    `${path.relative(workingDirectory, paths.source)}: ${info.width}x${info.height}, mark ${cleaned.boundingBox.width}x${cleaned.boundingBox.height} at ${cleaned.boundingBox.left},${cleaned.boundingBox.top}`,
  );

  await mkdir(paths.appDirectory, { recursive: true });
  await mkdir(paths.iconsDirectory, { recursive: true });
  for (const file of await buildOutputFiles(mark, paths)) {
    await writeFile(file.path, file.bytes);
    console.log(`${path.relative(workingDirectory, file.path)}  ${file.description}  ${file.bytes.length} bytes`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
