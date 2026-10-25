import { NATIVE_SOURCE, type JobListItem } from "./types";

// Stands in for jobs posted on Callback until they are stored (features/companies.md): one
// fictional posting to try out how a native job is listed and highlighted. It is only added in
// development, so a real visitor never sees a fake job.
const DEV_NATIVE_JOBS: { job: JobListItem; description: string }[] =
  process.env.NODE_ENV === "development"
    ? [
        {
          job: {
            id: `${NATIVE_SOURCE}:dev-1`,
            title: "Senior React Developer",
            companyName: "Callback Demo Co",
            locationRaw: "Belgrade, Serbia",
            department: "Engineering",
            workMode: "HYBRID",
            // Fixed rather than "now", so the cached job list doesn't depend on when it was built.
            postedAt: "2026-10-25T09:00:00.000Z",
            firstSeenAt: "2026-10-25T09:00:00.000Z",
            url: null,
            source: NATIVE_SOURCE,
            active: true,
          },
          description:
            "A fictional posting for testing how jobs posted on Callback are listed.\n\n" +
            "Apply here and your application status updates automatically, with no tracking by hand.",
        },
      ]
    : [];

export const DEV_NATIVE_JOB_ITEMS = DEV_NATIVE_JOBS.map(({ job }) => job);

export const DEV_NATIVE_JOB_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  DEV_NATIVE_JOBS.map(({ job, description }) => [job.id, description]),
);
