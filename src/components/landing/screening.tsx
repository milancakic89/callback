import { ChevronRightIcon, CornerDownRightIcon } from "lucide-react";
import { cn } from "cn";
import { AvailabilityTag, Container, Initials, SectionHeading } from "./ui";

// Two complementary workflows on the same role. Illustrative only: the employer side is not built
// yet, and every name below is fictional.

const CRITERIA = [
  { label: "5+ years in product design", required: true },
  { label: "Portfolio link", required: true },
  { label: "B2B or SaaS", required: false },
  { label: "Design systems", required: false },
  { label: "EU time zone", required: false },
];

const APPLICANTS: { name: string; met: boolean[]; status: "match" | "review" | "missing" }[] = [
  { name: "Ana Novak", met: [true, true, true, true, true], status: "match" },
  { name: "Priya Raman", met: [true, true, true, true, true], status: "match" },
  { name: "Jonas Weber", met: [true, true, false, true, true], status: "review" },
  { name: "Mia Hoffmann", met: [true, true, true, false, true], status: "review" },
  { name: "Luka Petrović", met: [true, true, false, false, true], status: "review" },
  { name: "Tomás Ruiz", met: [true, false, true, true, false], status: "missing" },
];

const STATUS = {
  match: { label: "Meets all", className: "border-(--l-lime)/25 bg-(--l-lime)/[0.07] text-(--l-lime)" },
  review: { label: "Review", className: "border-(--l-line-strong) text-(--l-fg-muted)" },
  missing: { label: "Missing required", className: "border-(--l-line) text-(--l-fg-subtle)" },
};

export function Screening() {
  return (
    <section id="screening" className="border-t border-(--l-line)">
      <Container className="py-24 sm:py-32">
        <SectionHeading
          eyebrow="Screening workflows"
          tag={<AvailabilityTag status="soon" />}
          title="Two ways to review. One pipeline."
        >
          Use Smart Screening for the first pass on busy roles, and Fast Manual Mode when you want to read
          every application yourself. Mix both on the same role.
        </SectionHeading>

        <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            label="Smart Screening"
            title="Let automation handle the first pass."
            body="Set the requirements for a role. Smart Screening checks each application against them and sorts the list, so you start with the strongest matches. Your team still makes every decision."
          >
            <ScreeningTable />
          </Panel>
          <Panel
            label="Fast Manual Mode"
            title="Stay in control of every decision."
            body="Open the original CV and cover letter side by side, decide, and press Next. No downloads, no extra tabs, no reformatted profiles."
          >
            <MiniWorkspace />
          </Panel>
        </div>

        <ol
          data-reveal
          aria-label="How the two workflows fit together"
          className="mt-4 flex flex-col gap-3 rounded-2xl border border-(--l-line) px-5 py-5 text-[14px] text-(--l-fg-muted) sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-4"
        >
          {["Smart Screening sorts the list", "You open the shortlist in Fast Manual Mode", "You decide", "The candidate is updated"].map(
            (step, i) => (
              <li key={step} className="flex items-center gap-3">
                {i > 0 && <ChevronRightIcon className="hidden size-4 shrink-0 text-(--l-fg-subtle) lg:block" />}
                {i > 0 && <CornerDownRightIcon className="size-4 shrink-0 text-(--l-fg-subtle) lg:hidden" />}
                <span className={cn(i === 3 && "text-(--l-fg)")}>{step}</span>
              </li>
            ),
          )}
        </ol>
      </Container>
    </section>
  );
}

function Panel({
  label,
  title,
  body,
  children,
}: {
  label: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article data-reveal className="flex flex-col overflow-hidden rounded-2xl border border-(--l-line) bg-(--l-surface)">
      <div className="p-6 sm:p-8">
        <p className="font-mono text-[11px] tracking-[0.14em] text-(--l-lime) uppercase">{label}</p>
        <h3 className="mt-4 text-[clamp(1.4rem,2.4vw,1.75rem)] leading-tight font-semibold tracking-[-0.025em]">{title}</h3>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-(--l-fg-muted)">{body}</p>
      </div>
      {/* The visual sits flush with the panel's bottom-right corner, like a cropped screenshot. */}
      <div aria-hidden className="mt-auto pl-6 sm:pl-8">
        <div className="overflow-hidden rounded-tl-xl border-t border-l border-(--l-line-strong) bg-(--l-bg)">{children}</div>
      </div>
    </article>
  );
}

function ScreeningTable() {
  return (
    <div className="text-[13px]">
      <div className="flex items-center justify-between border-b border-(--l-line) px-4 py-3">
        <p className="font-medium">Applicants</p>
        <p className="text-[12px] text-(--l-fg-subtle)">Sorted by requirements met</p>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-(--l-line) px-4 py-3">
        {CRITERIA.map((criterion, i) => (
          <span
            key={criterion.label}
            className="inline-flex items-center gap-1.5 rounded-md border border-(--l-line-strong) bg-white/[0.02] px-2 py-1 text-[11.5px] text-(--l-fg-muted)"
          >
            <span className="font-mono text-[10px] text-(--l-fg-subtle)">{i + 1}</span>
            {criterion.label}
            {criterion.required && <span className="text-(--l-lime)/80">*</span>}
          </span>
        ))}
      </div>
      <ul>
        {APPLICANTS.map((applicant) => (
          <li key={applicant.name} className="flex items-center gap-3 border-b border-(--l-line) px-4 py-2.5 last:border-b-0">
            <Initials name={applicant.name} className="size-6 text-[9.5px]" />
            <p className="min-w-0 flex-1 truncate">{applicant.name}</p>
            <span className="hidden gap-1 sm:flex">
              {applicant.met.map((met, i) => (
                <span key={i} className={cn("size-2 rounded-[2px]", met ? "bg-(--l-lime)/85" : "bg-white/10")} />
              ))}
            </span>
            <span className="w-8 text-right font-mono text-[11.5px] text-(--l-fg-subtle) tabular-nums">
              {applicant.met.filter(Boolean).length}/5
            </span>
            <span
              className={cn(
                "w-[7.5rem] shrink-0 rounded-full border px-2 py-0.5 text-center text-[11px] whitespace-nowrap",
                STATUS[applicant.status].className,
              )}
            >
              {STATUS[applicant.status].label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkeletonLines({ widths, className }: { widths: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-[5px]", className)}>
      {widths.map((width, i) => (
        <span key={i} className="h-[3px] rounded-full bg-black/15" style={{ width }} />
      ))}
    </div>
  );
}

function MiniWorkspace() {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-(--l-line) px-4 py-3 text-[13px]">
        <div className="flex min-w-0 items-center gap-2.5">
          <Initials name="Jonas Weber" className="size-6 text-[9.5px]" />
          <p className="truncate font-medium">Jonas Weber</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] text-(--l-fg-subtle) tabular-nums">2 / 3</span>
          <span className="inline-flex h-6 items-center rounded-md border border-(--l-line-strong) px-2 text-[11.5px] text-(--l-fg-muted)">
            Previous
          </span>
          <span className="inline-flex h-6 items-center rounded-md bg-(--l-lime) px-2 text-[11.5px] font-medium text-(--l-on-lime)">
            Next
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-(--l-line)">
        {["CV", "Cover letter"].map((label) => (
          <div key={label} className="bg-(--l-surface-2) px-4 pt-4 sm:px-6 sm:pt-5">
            <p className="mb-3 text-[11px] text-(--l-fg-subtle)">{label}</p>
            {/* A page cut off by the panel edge: just enough structure to read as a document. */}
            <div className="h-[18.5rem] overflow-hidden rounded-t-[3px] bg-(--l-paper) px-4 pt-4 sm:px-5 sm:pt-5">
              {label === "CV" ? (
                <div className="grid grid-cols-[30%_1fr] gap-3">
                  <div className="flex flex-col gap-3 rounded-sm bg-[#eef1f4] p-2">
                    <p className="text-[9px] leading-tight font-bold text-[#1d3557]">Jonas Weber</p>
                    <SkeletonLines widths={["90%", "70%", "80%"]} />
                    <SkeletonLines widths={["60%", "85%", "75%", "65%"]} />
                  </div>
                  <div className="flex flex-col gap-3">
                    <SkeletonLines widths={["40%"]} />
                    <SkeletonLines widths={["100%", "95%", "70%"]} />
                    <SkeletonLines widths={["45%"]} />
                    <SkeletonLines widths={["100%", "92%", "96%", "60%"]} />
                    <SkeletonLines widths={["100%", "88%", "40%"]} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <span className="h-[3px] w-6 bg-[#1d3557]" />
                  <p className="text-[9px] font-bold text-[#1d3557]">Jonas Weber</p>
                  <SkeletonLines widths={["35%"]} />
                  <SkeletonLines widths={["100%", "97%", "94%", "70%"]} />
                  <SkeletonLines widths={["100%", "92%", "96%", "55%"]} />
                  <SkeletonLines widths={["100%", "85%"]} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
