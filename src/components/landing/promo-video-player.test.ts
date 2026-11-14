import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PROMO_VIDEO_FILES } from "./promo-video-files";
import { PromoVideoFrame, PromoVideoPlayer } from "./promo-video-player";

const PLAY_BUTTON_NAME = "Play the 60-second film";

function renderFrame(state: { enhanced: boolean; started: boolean }) {
  return renderToStaticMarkup(
    createElement(PromoVideoFrame, { files: PROMO_VIDEO_FILES, ...state, onPlay: () => {} }),
  );
}

// React writes `playsInline` and `srcLang` in camel case; HTML reads attribute names without regard to case,
// so the tests below match those two without it.
function videoTag(html: string): string {
  return html.match(/<video[^>]*>/)?.[0] ?? "";
}

const STATES = [
  { name: "not enhanced", enhanced: false, started: false },
  { name: "enhanced, not started", enhanced: true, started: false },
  { name: "started", enhanced: true, started: true },
];

describe("PromoVideoFrame", () => {
  describe.each(STATES)("$name", (state) => {
    const html = renderFrame(state);

    it("loads nothing of the film before it is played, and plays inline", () => {
      const tag = videoTag(html);
      expect(tag).toContain('preload="none"');
      expect(tag).toMatch(/\splaysinline=""/i);
      expect(tag).not.toMatch(/\sautoplay/i);
    });

    it("shows the poster", () => {
      expect(videoTag(html)).toContain(`poster="${PROMO_VIDEO_FILES.poster}"`);
    });

    it("has the MP4 as a source, with its type", () => {
      expect(html).toContain(`<source src="${PROMO_VIDEO_FILES.video}" type="video/mp4"/>`);
    });

    it("has the English captions, off by default", () => {
      const track = html.match(/<track[^>]*>/)?.[0] ?? "";
      expect(track).toContain('kind="captions"');
      expect(track).toMatch(/\ssrclang="en"/i);
      expect(track).toContain('label="English"');
      expect(track).toContain(`src="${PROMO_VIDEO_FILES.captions}"`);
      expect(track).not.toContain("default");
    });

    it("reserves a 16:9 box, so nothing moves while the poster loads", () => {
      expect(html).toMatch(/^<div class="[^"]*\baspect-video\b/);
    });

    it("gives a browser that can't play video a link to the file", () => {
      expect(html).toContain(`<a href="${PROMO_VIDEO_FILES.video}">`);
    });
  });

  it("not enhanced: has the native controls and no play button", () => {
    const html = renderFrame({ enhanced: false, started: false });
    expect(videoTag(html)).toMatch(/\scontrols=""/);
    expect(html).not.toContain("<button");
    expect(html).not.toContain(PLAY_BUTTON_NAME);
  });

  it("enhanced, not started: has the play button, named, and no native controls behind it", () => {
    const html = renderFrame({ enhanced: true, started: false });
    expect(videoTag(html)).not.toMatch(/\scontrols/);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<button[^>]*type="button"[^>]*aria-label="${PLAY_BUTTON_NAME}"`));
    expect(html).toContain("Watch the film");
    expect(html).toContain("1:00");
  });

  it("started: has the native controls and no play button", () => {
    const html = renderFrame({ enhanced: true, started: true });
    expect(videoTag(html)).toMatch(/\scontrols=""/);
    expect(html).not.toContain("<button");
    expect(html).not.toContain(PLAY_BUTTON_NAME);
    expect(html).not.toContain("Watch the film");
  });
});

describe("PromoVideoPlayer", () => {
  // Rendered on the server, where nothing is hydrated yet: the plain video, which plays without scripts.
  const html = renderToStaticMarkup(createElement(PromoVideoPlayer, { files: PROMO_VIDEO_FILES }));

  it("starts as the plain video with its controls, so it works before and without scripting", () => {
    expect(videoTag(html)).toMatch(/\scontrols=""/);
    expect(html).not.toContain("<button");
  });

  it("uses the files it is given", () => {
    const otherFiles = { video: "/other.mp4", poster: "/other.webp", captions: "/other.vtt" };
    const otherHtml = renderToStaticMarkup(createElement(PromoVideoPlayer, { files: otherFiles }));
    expect(otherHtml).toContain('poster="/other.webp"');
    expect(otherHtml).toContain('src="/other.mp4"');
    expect(otherHtml).toContain('src="/other.vtt"');
  });
});
