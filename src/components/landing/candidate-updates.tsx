import { CheckIcon, ChevronDownIcon, MailIcon, MousePointer2Icon } from "lucide-react";
import { cn } from "cn";
import { AvailabilityTag, Container, SectionHeading } from "./ui";

// How an application moves and what the candidate hears at each step. When the timeline scrolls
// into view the lime line draws across and the steps light up in order (landing.css). Illustrative:
// the employer side is not built yet.

const STEPS = [
  {
    title: "Application submitted",
    body: "The candidate applies and gets a confirmation straight away.",
    artifact: (
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-(--l-lime)/12 text-(--l-lime)">
          <CheckIcon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">Application received</p>
          <p className="truncate text-(--l-fg-subtle)">Senior Product Designer · Halden</p>
        </div>
      </div>
    ),
  },
  {
    title: "Enters the pipeline",
    body: "It lands in the employer's applicant list, ready to screen.",
    artifact: (
      <div className="flex flex-wrap items-center gap-1">
        {["New", "Screening", "Interview", "Offer"].map((stage, i) => (
          <span
            key={stage}
            className={cn(
              "rounded-md border px-1.5 py-1 text-[11.5px]",
              i === 1 ? "border-white/20 bg-white/[0.06] text-(--l-fg)" : "border-(--l-line) text-(--l-fg-subtle)",
            )}
          >
            {stage}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: "Status updated",
    body: "A recruiter moves the application to its next stage.",
    artifact: (
      <div className="relative w-fit">
        <span className="inline-flex items-center gap-2 rounded-md border border-(--l-line-strong) bg-white/[0.04] px-2.5 py-1.5">
          <span className="text-(--l-fg-subtle)">Move to</span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="size-1.5 rounded-full bg-(--l-lime)" />
            Interview
          </span>
          <ChevronDownIcon className="size-3.5 text-(--l-fg-subtle)" />
        </span>
        <MousePointer2Icon className="absolute -right-3 -bottom-3 size-4 fill-(--l-fg) text-(--l-bg)" />
      </div>
    ),
  },
  {
    title: "Candidate informed",
    body: "The candidate gets the message your team set for that stage.",
    artifact: (
      <div className="flex items-start gap-2.5">
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-(--l-fg-muted)">
          <MailIcon className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">Update on your application</p>
          <p className="text-(--l-fg-subtle)">You&rsquo;ve been invited to interview.</p>
        </div>
      </div>
    ),
  },
];

export function CandidateUpdates() {
  return (
    <section id="updates" className="border-t border-(--l-line)">
      <Container className="py-24 sm:py-32">
        <SectionHeading
          eyebrow="Candidate updates"
          tag={<AvailabilityTag status="soon" />}
          title="Silence shouldn't be part of the hiring process."
        >
          When an application moves to a new stage, Callback can let the candidate know automatically,
          with messages your team writes once. Candidates know where they stand, and recruiters stop
          writing the same email twice.
        </SectionHeading>

        <div data-reveal className="relative mt-16">
          {/* The track: horizontal from lg up, vertical (left edge) below. */}
          <div aria-hidden className="absolute top-3 right-0 left-0 hidden h-px bg-(--l-line-strong) lg:block">
            <div className="l-progress h-px origin-left bg-(--l-lime)" />
          </div>
          <div aria-hidden className="absolute top-3 bottom-6 left-3 w-px bg-(--l-line-strong) lg:hidden">
            <div className="l-progress-y h-full w-px origin-top bg-(--l-lime)" />
          </div>

          <ol className="relative grid grid-cols-1 gap-10 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="l-step relative pl-12 lg:pl-0"
                style={{ "--l-step": i } as React.CSSProperties}
              >
                <span className="absolute top-0 left-0 inline-flex size-6 items-center justify-center rounded-full border border-(--l-lime)/40 bg-(--l-bg) font-mono text-[10.5px] text-(--l-lime) lg:static">
                  {i + 1}
                </span>
                <p className="text-[16px] font-medium lg:mt-7">{step.title}</p>
                <p className="mt-2 max-w-xs text-[14.5px] leading-relaxed text-(--l-fg-muted)">{step.body}</p>
                <div className="mt-5 rounded-xl border border-(--l-line) bg-(--l-surface) p-3.5 text-[12.5px]">
                  {step.artifact}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p data-reveal className="mt-12 max-w-2xl text-[13.5px] leading-relaxed text-(--l-fg-subtle)">
          Updates are sent from templates your team controls. Personal feedback is still yours to write.
        </p>
      </Container>
    </section>
  );
}
