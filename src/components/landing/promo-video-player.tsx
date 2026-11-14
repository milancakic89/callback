"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { PlayIcon } from "lucide-react";
import type { PromoVideoFiles } from "./promo-video-files";
import { useHydrated } from "./use-hydrated";

// The promo film's player (features/promo-video.md, "the film on the landing page").
//
// Without scripting it is a plain `<video controls>`, which plays. Once the page has hydrated, the
// native controls are put behind a play button over the poster; pressing it plays the film and gives the
// controls back. `preload="none"`: not a byte of the MP4 is fetched until then, only the poster. No
// autoplay: the film has a voice. The captions are off until the visitor turns them on.
//
// PromoVideoFrame only draws, from its props, so each state can be rendered by a test;
// PromoVideoPlayer holds the state and the call to `play()`.

const PLAY_LABEL = "Play the 60-second film";

type PromoVideoFrameProps = {
  files: PromoVideoFiles;
  // True once scripting is running, so the play button can work.
  enhanced: boolean;
  // True once the play button has been pressed.
  started: boolean;
  onPlay: () => void;
  videoRef?: Ref<HTMLVideoElement>;
};

export function PromoVideoFrame({ files, enhanced, started, onPlay, videoRef }: PromoVideoFrameProps) {
  const showsPlayButton = enhanced && !started;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-(--l-line-strong) bg-(--l-surface) shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] sm:rounded-2xl">
      <video
        ref={videoRef}
        className="absolute inset-0 size-full bg-black object-contain"
        controls={!showsPlayButton}
        preload="none"
        playsInline
        poster={files.poster}
        aria-label="Callback in 60 seconds"
      >
        <source src={files.video} type="video/mp4" />
        <track kind="captions" src={files.captions} srcLang="en" label="English" />
        <p>
          Your browser can&rsquo;t play this video. <a href={files.video}>Open the film as an MP4</a>.
        </p>
      </video>

      {showsPlayButton && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/15 px-4">
          <div className="flex max-w-full items-center gap-3 rounded-full border border-(--l-line-strong) bg-(--l-bg)/85 p-2 pr-5 sm:gap-4 sm:p-2.5 sm:pr-7">
            {/* The button's ::after covers the whole frame (landing.css), so the poster plays it as well. */}
            <button type="button" aria-label={PLAY_LABEL} onClick={onPlay} className="l-film-play shrink-0 rounded-full">
              <span
                aria-hidden
                className="l-film-play-disc relative flex size-12 items-center justify-center rounded-full bg-(--l-lime) text-(--l-on-lime) sm:size-16"
              >
                <span className="l-ping absolute inset-0 rounded-full bg-(--l-lime)/40" />
                <PlayIcon className="relative size-5 translate-x-px fill-current sm:size-6" />
              </span>
            </button>
            <span aria-hidden className="pointer-events-none text-sm font-medium whitespace-nowrap sm:text-base">
              Watch the film <span className="text-(--l-fg-subtle)">&middot;</span> 1:00
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function PromoVideoPlayer({ files }: { files: PromoVideoFiles }) {
  const enhanced = useHydrated();
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The play button goes away when it is pressed; the focus moves to the video (which has its controls
  // by then) so a keyboard user is not left on nothing.
  useEffect(() => {
    if (started) videoRef.current?.focus();
  }, [started]);

  async function playFilm() {
    // The controls come back first, so if the browser refuses to play (a data-saver mode, a policy) the
    // visitor still has a play button of the browser's own.
    setStarted(true);
    try {
      await videoRef.current?.play();
    } catch {
      // Refused: nothing to do, the native controls are showing.
    }
  }

  return <PromoVideoFrame files={files} enhanced={enhanced} started={started} onPlay={playFilm} videoRef={videoRef} />;
}
