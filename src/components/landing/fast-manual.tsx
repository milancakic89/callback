import { ReviewScreenshots } from "./review-screenshots";
import { REVIEW_SHOTS } from "./review-shots";
import { AvailabilityTag, Container, SectionHeading } from "./ui";

// The signature section: screenshots of the real review screen (the applicant review,
// features/applicant-review.md), taken from the sample job every new employer account starts with
// (features/landing-screenshots.md). Re-take them with `npm run landing:screenshots` when that
// screen changes.
export function FastManual() {
  return (
    <section id="product" className="relative border-t border-(--l-line) bg-(--l-surface)/60">
      <div aria-hidden className="l-hero-light pointer-events-none absolute inset-x-0 top-0 h-[40rem] opacity-80" />
      <Container className="relative py-24 sm:py-32">
        <SectionHeading
          align="center"
          eyebrow="Fast Manual Mode"
          tag={<AvailabilityTag status="live" />}
          title="Two documents. One decision. Next."
          className="mx-auto"
        >
          Review every application in a focused workspace, with the original CV and cover letter side by
          side and a keyword check against the job&rsquo;s requirements beside them. Set a hiring status,
          and move to the next one without losing your rhythm.
        </SectionHeading>

        <div data-reveal className="mt-14 sm:mt-16">
          <ReviewScreenshots shots={REVIEW_SHOTS} />
          <p className="mt-6 px-1 text-center text-[12px] text-(--l-fg-subtle)">
            Screenshots of the real screen. Candidates and documents are fictional: a new employer account
            starts with a sample job like this one to try.
          </p>
        </div>
      </Container>
    </section>
  );
}
