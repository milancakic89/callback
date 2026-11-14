// Where the promo film's files are served from (features/promo-video.md, "the film on the landing
// page"). They are made in the video's own project (../promo-video, outside this repo) and copied into
// public/videos/; promo-video-files.test.ts fails when one of them is renamed or missing, so the page
// never points at a file that is not there.

export type PromoVideoFiles = {
  // The MP4 (H.264 and AAC, with the voice and the music): not requested until the visitor presses play.
  video: string;
  // A frame of the film, shown until it plays.
  poster: string;
  // The English captions (WebVTT), one cue per spoken line.
  captions: string;
};

export const PROMO_VIDEO_FILES: PromoVideoFiles = {
  video: "/videos/callback-promo.mp4",
  poster: "/videos/callback-promo-poster.webp",
  captions: "/videos/callback-promo.en.vtt",
};
