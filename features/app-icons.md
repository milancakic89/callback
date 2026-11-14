# Feature: App icons (browser tab, Android home screen, iOS)

**Status:** done, 2026-11-15, on the branch `feat/app-icons` (not committed). Every file of the plan is made by `npm run icons` (its output is to be committed with the script); `src/app/favicon.ico` is now the generated one. Constants: fill white `#ffffff`; mark scale 92 % (icon.png, `any` icons), 72 % (apple-icon), 62 % (maskable); favicon 1 px margin at 16, 32 and 48 (not just at 16); the specks were all faint (alpha under 32, 15,442 pixels), the mark's box is 823x821 at 222,172. Checks: `npm test` 143 files, 1350 tests passed (was 138 and 1321); `npm run lint` and `npx tsc --noEmit` clean; `npm run build` lists `/manifest.webmanifest`, `/icon.png` and `/apple-icon.png` as `○`, and `/` is `○ Static` (revalidate 1h, expire 1d); on `npm start -p 3101`, `/`, `/jobs` and `/sign-in` signed out answer 200, with no redirect, and carry the manifest, icon (favicon.ico, icon.png) and apple-touch-icon links, each answering 200 with `image/x-icon`, `image/png` and `application/manifest+json`. Contact sheet and cleaned mark were looked at (specks gone, no halo or clipped edge, mark centred, the maskable mark inside the 80 % safe circle). Deviations: (1) Next writes the favicon link as `sizes="48x48"` with a content-hash query (it reads the ICO's largest image), not `sizes="any"`; (2) `cleanLogo` throws unless one region holds *more* than half of the opaque pixels (the plan's "less than half" would let two equal blobs through, and its own test needs them to throw); (3) one small extra module, `scripts/app-icons/png-size.ts` (+ test), shared by the two `src/app` tests for reading a PNG's size; (4) a light sharpen at 16 and 32 px was tried and dropped: it washed out the blue and drew a halo, so the 16 px icon is the plain lanczos3 downscale. Not done: nothing from the plan; the Android check (remove and re-add the shortcut) is the owner's, after the deploy.

## Why (the owner)
A callback.rs shortcut on an Android home screen shows a pixelated Next.js icon, and so does the browser tab. Both should show Callback's own mark, made from `public/logoicon.png`.

## What is there today
- `src/app/favicon.ico` is Create Next App's default (the initial commit). It is the only icon the site has: no `icon`, `apple-icon` or manifest, and `src/app/layout.tsx` sets no `icons`. With nothing better, Android builds the shortcut from that 16–32 px favicon, which is where the pixelation comes from.
- `public/logoicon.png` (new, not yet committed) is 1267×1241 RGBA, with a transparent background and a blue-to-violet "G". It is **not clean**: removing its background left loose blue specks around the mark and inside its counter. They would hardly show at 16 px, but would be visible at 512 px, so they are removed before anything is resized.

## Decisions
- **File conventions, not hand-written `<link>` tags** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`, `manifest.md`):
  - `src/app/favicon.ico`, `src/app/icon.png` and `src/app/apple-icon.png`;
  - `src/app/manifest.ts`, served as `/manifest.webmanifest`.
  Next writes the `<link>` tags itself, with `sizes` and `type`, and adds a content hash to `icon` and `apple-icon`.
- **A background only where one is needed.** The tab icons and the manifest's `any` icons stay transparent. The `apple-icon` is filled, because iOS turns transparency black. So are the `maskable` icons, because Android crops them to the launcher's circle or squircle. Their background is **white**: the blue-to-violet mark reads best on it. It is one constant, so a dark background (`#09090b`, the landing page's) is a one-line change.
- **`display: "browser"`.** The shortcut keeps opening callback.rs in Chrome, as today: the request is about the icon, not about turning the site into an app. `standalone` (its own window, no address bar, and no small Chrome badge on the icon) is also a one-line change, if the owner wants it.
- **One script makes every file, and its output is committed.** The build does no image work, and a new logo is one command: `npm run icons`.
- No change to the CSP: `default-src 'self'` covers the manifest, and `img-src 'self'` covers the icons. No change to the proxy either: its matcher already skips `.ico` and `.png`, and `/manifest.webmanifest` has a dot, so `isWorkspacePath` is false and nobody is redirected (`gateRedirect`).

## The files
| File | Size | Background | Mark | Used by |
|---|---|---|---|---|
| `src/app/favicon.ico` | 16, 32 and 48 in one file (PNG entries) | transparent | fills the square, 1 px margin at 16 | browser tabs, bookmarks |
| `src/app/icon.png` | 192×192 | transparent | ~92 % | browsers that prefer a PNG (high-DPI tabs) |
| `src/app/apple-icon.png` | 180×180 | white | ~72 % | iOS "Add to Home Screen"; Android's fallback |
| `public/icons/icon-192.png`, `icon-512.png` | 192, 512 | transparent | ~92 % | manifest, `purpose: "any"` |
| `public/icons/icon-maskable-192.png`, `icon-maskable-512.png` | 192, 512 | white, full bleed | ~62 %, inside the 80 % safe circle | manifest, `purpose: "maskable"` (Android's adaptive icon) |

The mark's size is measured on its own bounding box, after cleaning, and the mark is centred. The ~ figures are named constants in the script.

## The manifest (`src/app/manifest.ts`)
- **Names:** `name` "Callback" and `short_name` "Callback".
- **Description:** the landing page's own sentence, "Every application deserves a response."
- **Start and scope:** `start_url` "/", `scope` "/".
- **Display:** `display` "browser".
- **Colours:** `background_color` and `theme_color` both "#ffffff".
- **Icons:** the four `public/icons/` files, each with `sizes`, `type: "image/png"` and its `purpose`.

It reads no request data, so it is static (`manifest.md`: cached by default).

## The script
`scripts/generate-app-icons.ts` (`npm run icons`, run as `node --import tsx` like `landing:screenshots`). It takes the source path and the output folders as arguments, with today's paths as the defaults. It uses `sharp` (already a devDependency). The pure parts are split out so they can be tested:
- **`scripts/app-icons/clean-logo.ts`**, on a raw RGBA buffer, with the width and height passed in:
  - the opaque mask is alpha ≥ 128;
  - the mark is the largest 8-connected region of that mask;
  - kept: the mark, plus any pixel with alpha > 0 within 2 px of it (the anti-aliased edge);
  - every other pixel gets alpha 0.
  It throws if the largest region holds less than half of the opaque pixels, a sign that the source is no longer one mark. It returns the cleaned buffer and the mark's bounding box.
- **`scripts/app-icons/ico.ts`:** packs PNG buffers (each with its size) into one ICO: the header, a directory entry per image (a size of 256 written as 0), and the PNG data at its offset.
- **`scripts/generate-app-icons.ts`** cleans the logo, crops it to the mark and places it centred, at each file's scale, on a transparent or white square. Resizing uses `lanczos3` from the cleaned full-resolution mark each time, never from a smaller copy. It writes every file in the table and prints each path with its size.

## Tests (vitest; `scripts/**/*.test.ts` and `src/**/*.test.ts` are already included)
- `scripts/app-icons/clean-logo.test.ts`, on a small synthetic image:
  - a large disc with soft edges and a few loose specks loses the specks and keeps the disc with its soft edge;
  - the bounding box is the disc's;
  - an image of two equal blobs throws.
- `scripts/app-icons/ico.test.ts`:
  - the header (reserved 0, type 1, the count);
  - each entry's width, height and byte size;
  - offsets pointing at the right PNG bytes;
  - 256 written as 0.
- `src/app/manifest.test.ts`:
  - the names, `start_url` and `display`;
  - an `any` and a `maskable` icon at both 192 and 512;
  - every icon's file exists under `public/`, and its real size (read from the PNG's IHDR bytes, no `sharp`) matches its `sizes`.
- `src/app/app-icons.test.ts`:
  - `favicon.ico` holds 16, 32 and 48;
  - `icon.png` is 192×192;
  - `apple-icon.png` is 180×180;
  - each is read from its bytes.
- No existing test is changed.

## Checks
- `npm run icons`; `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`. The build's route table lists `/manifest.webmanifest`, `/icon.png` and `/apple-icon.png`, and `/` is still `○ Static` as before.
- On a production build (`npm start`, on a free port), the HTML of `/`, `/jobs` and `/sign-in` carries:
  - `<link rel="icon" href="/favicon.ico" sizes="any">`;
  - the `icon.png` link with `sizes="192x192"`;
  - `apple-touch-icon` with `sizes="180x180"`;
  - `<link rel="manifest" href="/manifest.webmanifest">`.
  Each of these answers 200 with the right `Content-Type` (`image/x-icon`, `image/png`, `application/manifest+json`), with no redirect, signed out.
- **A contact sheet, to look at.** It is saved to the scratchpad, not to the repo, and shows:
  - every output on a white and on a dark background, at 1× and enlarged;
  - the maskable 512 clipped by a circle and by a squircle.
  It must show no specks, no clipped edges and no halo.
- `public/logoicon.png` is committed with the rest, as the script's source.

## After the deploy (the owner)
Android keeps the icon of a shortcut that already exists: remove the callback.rs shortcut and add it again (Chrome menu → Add to home screen). Browsers cache favicons too, so a tab may need a hard reload to show the new one.
