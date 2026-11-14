import { PROMO_VIDEO_FILES } from "./promo-video-files";
import { PromoVideoPlayer } from "./promo-video-player";
import { Container, SectionHeading } from "./ui";

// The 60-second film, right under the hero (features/promo-video.md, "the film on the landing page"):
// it opens with the same problem as the section after it. A poster until the visitor presses play;
// the MP4 is not fetched before that.
export function PromoFilm() {
  return (
    <section id="film" className="border-t border-(--l-line)">
      <Container className="py-24 sm:py-32">
        <SectionHeading eyebrow="In 60 seconds" title="See how Callback works.">
          For candidates and employers: from the application to the interview.
        </SectionHeading>

        <div data-reveal className="mt-12 sm:mt-14">
          <PromoVideoPlayer files={PROMO_VIDEO_FILES} />
          <p className="mt-4 font-mono text-[11px] tracking-[0.14em] text-(--l-fg-muted) uppercase">
            1:00 &middot; Sound on &middot; Captions available
          </p>
        </div>
      </Container>
    </section>
  );
}
