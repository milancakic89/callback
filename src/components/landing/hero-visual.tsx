import { ProductShot } from "./product-shot";
import { REVIEW_SHOTS } from "./review-shots";
import { SAMPLE_ROLE } from "./sample-documents";

// The hero's product shot: the real review screen (the first of REVIEW_SHOTS, features/landing-
// screenshots.md) and, on top of it, the update the candidate receives when the recruiter moves them
// on. CSS motion only (landing.css): the window tilts into place, then the update arrives.
// Decorative: the same screenshot, with its description, is in the Fast Manual Mode section.
export function HeroVisual() {
  return (
    <div aria-hidden inert className="relative select-none">
      <div className="l-window-in">
        <div className="l-fade-bottom">
          <ProductShot shot={REVIEW_SHOTS[0]} decorative />
        </div>
      </div>

      {/* What the candidate sees once the stage changes. */}
      <div className="l-notify absolute right-3 bottom-[22%] w-[min(19rem,calc(100%-1.5rem))] rounded-xl border border-(--l-line-strong) bg-[#17171b]/95 p-4 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.8)] backdrop-blur-md sm:right-8 sm:w-80 lg:-right-5 lg:bottom-[30%]">
        <div className="flex items-center gap-2 text-[11.5px] text-(--l-fg-subtle)">
          <span className="relative flex size-2">
            <span className="l-ping absolute inset-0 rounded-full bg-(--l-lime)" />
            <span className="relative size-2 rounded-full bg-(--l-lime)" />
          </span>
          <span>Application update</span>
          <span className="ml-auto">now</span>
        </div>
        <p className="mt-2.5 text-[14.5px] leading-snug font-medium">You&rsquo;ve been invited to interview</p>
        <p className="mt-1 text-[13px] leading-snug text-(--l-fg-muted)">
          {SAMPLE_ROLE.title} at {SAMPLE_ROLE.company}. The team will be in touch to find a time.
        </p>
      </div>
    </div>
  );
}
