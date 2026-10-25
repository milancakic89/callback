import { ArrowRightIcon, HeartIcon, ListChecksIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { WORK_MODE_LABELS, type JobListItem } from "@/lib/jobs/types";
import { cn } from "cn";
import { AvailabilityTag, Container, SectionHeading, ctaClass } from "./ui";

// The candidate side exists today, so this section uses real data: the live job count and the
// newest postings from getActiveJobs(). The saved heart and "Applied" pill on two rows only
// illustrate the features; they're not anyone's data.
export function ForCandidates({ openRoles, jobs }: { openRoles: string; jobs: JobListItem[] }) {
  const features = [
    {
      icon: SearchIcon,
      title: "Search every open role in one list",
      body: `${openRoles} live openings, filterable by title, description, company, location and work mode.`,
    },
    { icon: HeartIcon, title: "Save the ones worth a second look", body: "One click on the heart keeps a job on your list." },
    {
      icon: ListChecksIcon,
      title: "Track each application",
      body: "Mark a job as applied, then follow it from Pending to Got offer.",
    },
  ];

  return (
    <section id="candidates" className="border-t border-(--l-line)">
      <Container className="grid grid-cols-1 gap-16 py-24 sm:py-32 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-20">
        <div>
          <SectionHeading
            eyebrow="For candidates"
            tag={<AvailabilityTag status="live" />}
            title="Find the role. Keep track of every application."
          >
            Browse live openings from job boards and company career pages, save what interests you, and
            always know where each application stands.
          </SectionHeading>

          <ul data-reveal className="mt-10 flex flex-col gap-6">
            {features.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-(--l-line-strong) bg-white/[0.03]">
                  <Icon className="size-4 text-(--l-fg-muted)" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[15px] font-medium">{title}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-(--l-fg-muted)">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div data-reveal className="mt-10 flex flex-wrap gap-3">
            <Link href="/jobs" className={ctaClass("primary")}>
              Find a job
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link href="/sign-up" className={ctaClass("secondary")}>
              Create a free account
            </Link>
          </div>
        </div>

        <JobBoardPreview openRoles={openRoles} jobs={jobs} />
      </Container>
    </section>
  );
}

// Scraped locations often repeat themselves ("Remote, Remote/Worldwide, Remote"); keep each part
// once, and at most two, so a row stays on one readable line.
function tidyLocation(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
  const unique = parts.filter((part, i) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === i);
  return unique.slice(0, 2).join(", ");
}

function JobBoardPreview({ openRoles, jobs }: { openRoles: string; jobs: JobListItem[] }) {
  return (
    <div data-reveal className="relative">
      <div className="overflow-hidden rounded-xl border border-(--l-line-strong) bg-(--l-surface) shadow-[0_40px_100px_-40px_rgb(0_0_0/0.9)]">
        <div className="flex items-center justify-between gap-4 border-b border-(--l-line) px-4 py-3.5 sm:px-5">
          <p className="text-[14px] font-medium">Open roles</p>
          <p className="font-mono text-[11.5px] text-(--l-fg-subtle) tabular-nums">{openRoles} live</p>
        </div>
        <div className="border-b border-(--l-line) px-4 py-3 sm:px-5">
          <div className="flex h-9 items-center gap-2 rounded-md border border-(--l-line) bg-white/[0.02] px-3 text-[13px] text-(--l-fg-subtle)">
            <SearchIcon className="size-3.5" />
            Search title, company or location
          </div>
        </div>
        <ul aria-label="Newest jobs on the job board">
          {jobs.map((job, i) => (
            <li
              key={job.id}
              className="flex items-center gap-3 border-b border-(--l-line) px-4 py-3.5 last:border-b-0 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{job.title}</p>
                <p className="mt-0.5 truncate text-[13px] text-(--l-fg-subtle)">
                  {[job.companyName, tidyLocation(job.locationRaw)].filter(Boolean).join(" · ")}
                </p>
              </div>
              {i === 2 ? (
                <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-(--l-lime)/25 bg-(--l-lime)/[0.07] px-2 py-0.5 text-[11.5px] text-(--l-lime) sm:inline-flex">
                  <span className="size-1.5 rounded-full bg-(--l-lime)" />
                  Applied · Pending
                </span>
              ) : (
                job.workMode && (
                  <span className="hidden shrink-0 rounded-full border border-(--l-line-strong) px-2 py-0.5 text-[11.5px] text-(--l-fg-muted) sm:inline">
                    {WORK_MODE_LABELS[job.workMode]}
                  </span>
                )
              )}
              <HeartIcon
                aria-hidden
                strokeWidth={1.75}
                className={cn(
                  "size-4 shrink-0",
                  i === 1 ? "fill-(--l-lime) text-(--l-lime)" : "text-(--l-fg-subtle)",
                )}
              />
            </li>
          ))}
        </ul>
        <Link
          href="/jobs"
          className="group flex items-center justify-between border-t border-(--l-line) px-4 py-3.5 text-[13px] text-(--l-fg-muted) transition-colors hover:bg-white/[0.02] hover:text-(--l-fg) sm:px-5"
        >
          Browse all {openRoles} roles
          <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
