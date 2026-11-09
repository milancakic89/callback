// The screenshots of Fast Manual Mode that the landing page shows (features/landing-screenshots.md).
// They are taken from the real review screen by `npm run landing:screenshots`
// (scripts/capture-landing-screenshots.ts), which reads the viewport sizes and file names from here
// and writes the files; the page reads the same list, so a size or a name cannot drift apart.

export type ShotImage = {
  // Path under /public, as the browser asks for it.
  src: string;
  width: number;
  height: number;
  alt: string;
};

export type ReviewShot = {
  id: "review" | "letter" | "status";
  // The short name on the switcher, and the sentence under the screenshot.
  label: string;
  caption: string;
  // What a laptop shows (the review's four columns).
  desktop: ShotImage;
  // What a phone shows (one view at a time, the actions in a bar at the bottom).
  mobile: ShotImage;
};

// CSS pixels, and how many device pixels each one is drawn with. The files hold the device pixels.
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
export const MOBILE_VIEWPORT = { width: 390, height: 844 };
export const DESKTOP_SCALE = 2;
export const MOBILE_SCALE = 2;

const DESKTOP_SIZE = {
  width: DESKTOP_VIEWPORT.width * DESKTOP_SCALE,
  height: DESKTOP_VIEWPORT.height * DESKTOP_SCALE,
};
const MOBILE_SIZE = {
  width: MOBILE_VIEWPORT.width * MOBILE_SCALE,
  height: MOBILE_VIEWPORT.height * MOBILE_SCALE,
};

export const REVIEW_SHOTS: ReviewShot[] = [
  {
    id: "review",
    label: "Side by side",
    caption:
      "The playlist, the original CV, the cover letter and a keyword check against the job's requirements, on one screen.",
    desktop: {
      src: "/landing/review-desktop.webp",
      ...DESKTOP_SIZE,
      alt: "Fast Manual Mode. A playlist of three candidates on the left, Ana Novak's CV and cover letter side by side, and her screening overview with the status set to Interview.",
    },
    mobile: {
      src: "/landing/review-mobile.webp",
      ...MOBILE_SIZE,
      alt: "Fast Manual Mode on a phone: Ana Novak's CV, with the statuses, a heart and the Next button in a bar at the bottom.",
    },
  },
  {
    id: "letter",
    label: "Cover letter",
    caption: "Hover the cover letter and it opens at reading size over the CV. Move away and it folds back.",
    desktop: {
      src: "/landing/letter-desktop.webp",
      ...DESKTOP_SIZE,
      alt: "Fast Manual Mode with Jonas Weber's cover letter open at reading size, next to his screening overview.",
    },
    mobile: {
      src: "/landing/letter-mobile.webp",
      ...MOBILE_SIZE,
      alt: "Fast Manual Mode on a phone: Jonas Weber's cover letter, with the statuses and the Next button in a bar at the bottom.",
    },
  },
  {
    id: "status",
    label: "Status",
    caption:
      "Set a status with a click or a key, and narrow the list by it. Nothing is rejected automatically.",
    desktop: {
      src: "/landing/status-desktop.webp",
      ...DESKTOP_SIZE,
      alt: "Fast Manual Mode with the status filter open on the playlist, listing Applied, Screening, Interview, Offer, Hired and Rejected with the number of candidates in each.",
    },
    mobile: {
      src: "/landing/status-mobile.webp",
      ...MOBILE_SIZE,
      alt: "Fast Manual Mode on a phone: Jonas Weber's screening overview, with his status set to Screening.",
    },
  },
];
