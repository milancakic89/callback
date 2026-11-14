import type { MetadataRoute } from "next";

// The web app manifest, served as /manifest.webmanifest (features/app-icons.md). Android reads it, with the
// icons below, to make the icon of a callback.rs shortcut on the home screen. The icons are made by
// `npm run icons` into public/icons/. It reads no request data, so it is built once and cached.
const BRAND_COLOUR = "#ffffff";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Callback",
    short_name: "Callback",
    description: "Every application deserves a response.",
    start_url: "/",
    scope: "/",
    // "browser": the shortcut opens callback.rs in the browser, as it did. "standalone" would give it a
    // window of its own, with no address bar and no small browser badge on its icon.
    display: "browser",
    background_color: BRAND_COLOUR,
    theme_color: BRAND_COLOUR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
