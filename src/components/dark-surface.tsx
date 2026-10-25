"use client";

import { useLayoutEffect } from "react";

// Marks <html> as dark while a dark page is on screen (globals.css styles html[data-surface="dark"]:
// the area behind the page, overscroll and native scrollbars). It can't be an `html:has(...)` rule on
// the page's own element: Next keeps the previous page mounted but hidden after a client navigation
// (React <Activity>), so landing → /jobs would leave the light page on a dark <html>. The effect of a
// hidden page is cleaned up, which is what this relies on. It is a layout effect because its cleanup
// runs synchronously when the page is hidden, before anything is painted (see
// node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md). The count keeps two dark
// pages that overlap during a navigation (landing → sign-in) from clearing each other's mark.
let darkPages = 0;

export function DarkSurface() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    darkPages += 1;
    root.dataset.surface = "dark";
    return () => {
      darkPages -= 1;
      if (darkPages === 0) delete root.dataset.surface;
    };
  }, []);

  return null;
}
