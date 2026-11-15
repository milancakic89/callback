import { buildTrackPath } from "../../src/lib/external-jobs/track-link";
import type { ScrapedJob } from "./sites/types";

// The "Add to Callback" button (features/chrome-extension.md): a plain link that opens callback.rs in a
// new tab, in a closed shadow root, so the site's own scripts and styles can't reach it and it can't
// disturb them. Nothing the page says is ever parsed as markup: the label is fixed text, the link is built
// by buildTrackPath (URL and URLSearchParams), and the page's words only reach the link's query and its
// tooltip, as strings. The button holds no token, calls no API, and sends nothing until it is clicked.

export const BUTTON_LABEL = "Add to Callback";
// Marks the button's element in the page, so a copy left by an earlier run of the script is found.
export const HOST_ATTRIBUTE = "data-callback-extension";

const STYLES = `
:host {
  all: initial;
  display: inline-block;
  vertical-align: middle;
  align-self: center;
  margin: 4px;
}
:host([data-mode="pill"]) {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  margin: 0;
}
a {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--callback-button-height, 40px);
  padding: 0 16px;
  border-radius: 8px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #ffffff;
  font: 600 14px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}
a:hover { filter: brightness(1.1); }
a:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px; }
:host([data-mode="pill"]) a {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
`;

type ButtonMode = "inline" | "pill";

type Mounted = {
  host: HTMLElement;
  link: HTMLAnchorElement;
  mode: ButtonMode;
  // What the link points to now, so an unchanged job doesn't touch the page again.
  href: string;
  title: string;
  height: number;
};

export type ButtonController = {
  // Puts the button where the job's Apply control is, or at the corner of the page when the job is found
  // but its control isn't, updates it when the job changes, and takes it away when there is no job.
  sync(job: ScrapedJob | null, applyControl: Element | null): void;
  // What is mounted now: for the tests, which can't look into a closed shadow root.
  current(): { host: HTMLElement; link: HTMLAnchorElement; mode: ButtonMode } | null;
  destroy(): void;
};

// The styles are a constructed stylesheet, which a page's Content-Security-Policy doesn't block (a
// `<style>` element could be). A browser without them gets the element anyway.
function applyStyles(doc: Document, root: ShadowRoot): void {
  const view = doc.defaultView;
  try {
    if (view && typeof view.CSSStyleSheet === "function" && "adoptedStyleSheets" in root) {
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(STYLES);
      root.adoptedStyleSheets = [sheet];
      return;
    }
  } catch {
    // Fall through to the element.
  }
  const style = doc.createElement("style");
  style.textContent = STYLES;
  root.append(style);
}

function tooltipFor(job: ScrapedJob): string {
  return job.company ? `Add "${job.title}" at ${job.company} to your Callback applications` : `Add "${job.title}" to your Callback applications`;
}

// `origin` is the callback.rs the link points to (https://callback.rs, or http://localhost:<port> in a
// development build). Passed in, not read from anywhere, so a test builds one for any origin.
export function createButtonController({ document: doc, origin }: { document: Document; origin: string }): ButtonController {
  let mounted: Mounted | null = null;

  function removeAll(): void {
    mounted = null;
    for (const stale of doc.querySelectorAll(`[${HOST_ATTRIBUTE}]`)) stale.remove();
  }

  function mount(job: ScrapedJob, href: string, applyControl: Element | null): void {
    const mode: ButtonMode = applyControl ? "inline" : "pill";
    const host = doc.createElement("div");
    host.setAttribute(HOST_ATTRIBUTE, "button");
    host.setAttribute("data-mode", mode);
    // The site's own scripts listen on its containers: a click on the button is not theirs to see.
    host.addEventListener("click", (event) => event.stopPropagation());

    const root = host.attachShadow({ mode: "closed" });
    applyStyles(doc, root);

    const link = doc.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = BUTTON_LABEL;
    link.title = tooltipFor(job);
    root.append(link);

    const height = applyControl ? Math.round(applyControl.getBoundingClientRect().height) : 0;
    if (height > 0) host.style.setProperty("--callback-button-height", `${height}px`);

    if (applyControl) applyControl.insertAdjacentElement("afterend", host);
    else (doc.body ?? doc.documentElement).append(host);

    mounted = { host, link, mode, href, title: link.title, height };
  }

  return {
    sync(job, applyControl) {
      if (!job) {
        if (mounted || doc.querySelector(`[${HOST_ATTRIBUTE}]`)) removeAll();
        return;
      }

      let href: string;
      try {
        href = new URL(buildTrackPath(job), origin).toString();
      } catch {
        // An address the server would refuse: no button rather than a link that leads nowhere.
        removeAll();
        return;
      }

      const wantedMode: ButtonMode = applyControl ? "inline" : "pill";
      const inPlace =
        mounted !== null &&
        mounted.host.isConnected &&
        mounted.mode === wantedMode &&
        (applyControl ? applyControl.nextElementSibling === mounted.host : mounted.host.parentNode !== null);
      if (!inPlace || !mounted) {
        removeAll();
        mount(job, href, applyControl);
        return;
      }

      if (mounted.href !== href) {
        mounted.link.href = href;
        mounted.href = href;
      }
      const title = tooltipFor(job);
      if (mounted.title !== title) {
        mounted.link.title = title;
        mounted.title = title;
      }
      const height = applyControl ? Math.round(applyControl.getBoundingClientRect().height) : 0;
      if (height > 0 && height !== mounted.height) {
        mounted.host.style.setProperty("--callback-button-height", `${height}px`);
        mounted.height = height;
      }
    },

    current() {
      return mounted ? { host: mounted.host, link: mounted.link, mode: mounted.mode } : null;
    },

    destroy: removeAll,
  };
}
