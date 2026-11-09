import { ReviewDemo, ReviewDemoHint } from "./review-demo";
import { AvailabilityTag, Container, SectionHeading } from "./ui";

// The signature section: the interactive CV-left / cover-letter-right workspace. The real thing is
// live for employers (the applicant review, features/applicant-review.md); this is a demo of it with
// the same fictional candidates every new employer account's sample job starts with.
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
          side. Set a hiring status, like a candidate for later, and move to the next one without losing
          your rhythm.
        </SectionHeading>

        <div data-reveal className="mt-14 sm:mt-16">
          <ReviewDemo />
          <div className="mt-4 flex items-center justify-between gap-4 px-1">
            <p className="text-[12px] text-(--l-fg-subtle)">
              Illustrative demo. Candidates and documents are fictional. A new employer account starts
              with a sample job like this one to try.
            </p>
            <ReviewDemoHint />
          </div>
        </div>
      </Container>
    </section>
  );
}
