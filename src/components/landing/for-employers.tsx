import { ArrowDownIcon } from "lucide-react";
import { AvailabilityTag, Container, SectionHeading } from "./ui";

const PILLARS = [
  {
    title: "Publish and manage roles",
    body: "Post a job, collect every application in one place, and see each candidate's stage at a glance.",
  },
  {
    title: "Screen your way",
    body: "Let Smart Screening take the first pass, or read every application yourself in Fast Manual Mode.",
    href: "#screening",
    link: "Compare workflows",
  },
  {
    title: "Keep candidates informed",
    body: "A stage change can send the candidate an update, so nobody is left guessing.",
    href: "#updates",
    link: "See how updates work",
  },
];

export function ForEmployers() {
  return (
    <section id="employers" className="border-t border-(--l-line)">
      <Container className="grid grid-cols-1 gap-14 py-24 sm:py-32 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <SectionHeading
          eyebrow="For employers"
          tag={<AvailabilityTag status="soon" />}
          title="Hire with less friction. Answer every applicant."
        >
          Callback&rsquo;s employer tools are in development: one workspace to publish roles, review applicants
          the way each role needs, and keep every candidate informed.
        </SectionHeading>

        <ol data-reveal className="border-t border-(--l-line) lg:mt-2">
          {PILLARS.map((pillar, i) => (
            <li key={pillar.title} className="grid grid-cols-[2.5rem_1fr] border-b border-(--l-line) py-7">
              <p className="pt-1 font-mono text-[12px] text-(--l-fg-subtle) tabular-nums">0{i + 1}</p>
              <div className="flex flex-col">
                <p className="text-lg font-medium tracking-[-0.01em]">{pillar.title}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-(--l-fg-muted)">{pillar.body}</p>
                {pillar.href && (
                  <a
                    href={pillar.href}
                    className="group mt-4 inline-flex w-fit items-center gap-1.5 text-[14px] text-(--l-fg) underline-offset-4 hover:underline"
                  >
                    {pillar.link}
                    <ArrowDownIcon className="size-3.5 transition-transform group-hover:translate-y-0.5" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
