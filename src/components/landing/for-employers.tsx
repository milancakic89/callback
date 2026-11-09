import { ArrowDownIcon, ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { AvailabilityTag, Container, SectionHeading, ctaClass, type Availability } from "./ui";

// What an employer can do today, and what is still to come, pillar by pillar (features/landing.md).
// An employer can open an account, post and publish a job, have each CV checked against its filters
// and review the applicants in Fast Manual Mode; the messages to candidates are not built, so they say so.
const PILLARS: {
  title: string;
  status: Availability;
  body: string;
  href?: string;
  link?: string;
}[] = [
  {
    title: "Publish and manage roles",
    status: "live",
    body: "Post a job with a live candidate preview, publish it to the job board, and see every application with its hiring stage. Your company gets its own address.",
  },
  {
    title: "Screen your way",
    status: "live",
    body: "Let Smart Screening take a first pass, checking each CV for the words of your requirements, or read every application yourself in Fast Manual Mode.",
    href: "#screening",
    link: "Compare workflows",
  },
  {
    title: "Keep candidates informed",
    status: "soon",
    body: "A stage change can send the candidate an update, so nobody is left guessing.",
    href: "#updates",
    link: "See how updates work",
  },
];

export function ForEmployers() {
  return (
    <section id="employers" className="border-t border-(--l-line)">
      <Container className="grid grid-cols-1 gap-14 py-24 sm:py-32 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div>
          <SectionHeading
            eyebrow="For employers"
            tag={<AvailabilityTag status="partial" />}
            title="Hire with less friction. Answer every applicant."
          >
            One workspace to publish roles, review applicants the way each role needs, and keep every
            candidate informed. Publishing, screening and review work today; automatic candidate updates
            are on the way.
          </SectionHeading>

          <div data-reveal className="mt-10 flex flex-wrap gap-3">
            <Link href="/sign-up" className={ctaClass("primary")}>
              Start hiring
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a href="#product" className={ctaClass("secondary")}>
              See Fast Manual Mode
            </a>
          </div>
        </div>

        <ol data-reveal className="border-t border-(--l-line) lg:mt-2">
          {PILLARS.map((pillar, i) => (
            <li key={pillar.title} className="grid grid-cols-[2.5rem_1fr] border-b border-(--l-line) py-7">
              <p className="pt-1 font-mono text-[12px] text-(--l-fg-subtle) tabular-nums">0{i + 1}</p>
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="text-lg font-medium tracking-[-0.01em]">{pillar.title}</p>
                  <AvailabilityTag status={pillar.status} />
                </div>
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
