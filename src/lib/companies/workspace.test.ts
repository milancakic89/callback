import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, selectJobs, selectJob, order, returns, is, not, eq, maybeSingle } = vi.hoisted(() => {
  const returns = vi.fn();
  const order = vi.fn(() => ({ returns }));
  const not = vi.fn(() => ({ order }));
  const is = vi.fn(() => ({ not }));
  const selectJobs = vi.fn(() => ({ is }));
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const selectJob = vi.fn(() => ({ eq }));
  return {
    from: vi.fn(),
    selectJobs,
    selectJob,
    order,
    returns,
    is,
    not,
    eq,
    maybeSingle,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

import { getCompanyJob, getCompanyJobs, getJobApplicants } from "./workspace";

const JOB_ID = "0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCompanyJobs", () => {
  beforeEach(() => {
    from.mockReturnValue({ select: selectJobs });
  });

  it("maps the published date and the two counts, and filters each embed by withdrawn_at", async () => {
    returns.mockResolvedValue({
      data: [
        {
          id: "a",
          title: "Published job",
          is_demo: false,
          published_at: "2026-10-30T10:00:00Z",
          created_at: "2026-10-30T09:00:00Z",
          active: [{ count: 3 }],
          withdrawn: [{ count: 2 }],
        },
        {
          id: "b",
          title: "Draft",
          is_demo: true,
          published_at: null,
          created_at: "2026-10-29T09:00:00Z",
          active: [],
          withdrawn: [],
        },
      ],
      error: null,
    });

    expect(await getCompanyJobs()).toEqual([
      {
        id: "a",
        title: "Published job",
        isDemo: false,
        publishedAt: "2026-10-30T10:00:00Z",
        createdAt: "2026-10-30T09:00:00Z",
        applicantCount: 3,
        withdrawnCount: 2,
      },
      {
        id: "b",
        title: "Draft",
        isDemo: true,
        publishedAt: null,
        createdAt: "2026-10-29T09:00:00Z",
        applicantCount: 0,
        withdrawnCount: 0,
      },
    ]);
    expect(from).toHaveBeenCalledWith("job_postings");
    expect(is).toHaveBeenCalledWith("active.withdrawn_at", null);
    expect(not).toHaveBeenCalledWith("withdrawn.withdrawn_at", "is", null);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("throws on a database error", async () => {
    returns.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getCompanyJobs()).rejects.toThrow("getCompanyJobs: boom");
  });
});

describe("getCompanyJob", () => {
  beforeEach(() => {
    from.mockReturnValue({ select: selectJob });
  });

  it("answers null for an id that isn't a uuid, without asking the database", async () => {
    for (const jobId of ["", "1", "not-a-uuid", `${JOB_ID}'; drop table job_postings`]) {
      expect(await getCompanyJob(jobId), jobId).toBeNull();
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("answers null when row level security hides the job or it doesn't exist", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await getCompanyJob(JOB_ID)).toBeNull();
    expect(eq).toHaveBeenCalledWith("id", JOB_ID);
  });

  it("maps the job and its filter lists, with an empty string for a missing location", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: JOB_ID,
        title: "Designer",
        description: "Design.",
        location_raw: null,
        work_mode: "REMOTE",
        required_filters: ["Figma", "5+ years"],
        optional_filters: [],
        is_demo: false,
      },
      error: null,
    });

    expect(await getCompanyJob(JOB_ID)).toEqual({
      id: JOB_ID,
      title: "Designer",
      description: "Design.",
      location: "",
      workMode: "REMOTE",
      requiredFilters: ["Figma", "5+ years"],
      optionalFilters: [],
      isDemo: false,
    });
  });

  it("selects the two filter columns", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await getCompanyJob(JOB_ID);

    expect(selectJob).toHaveBeenCalledOnce();
    expect(selectJob.mock.calls[0]).toEqual([expect.stringContaining("required_filters, optional_filters")]);
  });

  it("throws on a database error", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getCompanyJob(JOB_ID)).rejects.toThrow("getCompanyJob: boom");
  });
});

describe("getJobApplicants", () => {
  const applicantsReturns = vi.fn();
  const applicantsOrder = vi.fn(() => ({ returns: applicantsReturns }));
  const applicantsIs = vi.fn(() => ({ order: applicantsOrder }));
  const applicantsEq = vi.fn(() => ({ is: applicantsIs }));
  const applicantsSelect = vi.fn(() => ({ eq: applicantsEq }));

  const row = (fields: Record<string, unknown>) => ({
    id: "app-1",
    applied_at: "2026-10-31T09:00:00+00:00",
    viewed_at: null,
    liked_at: null,
    matched_filters: null,
    cv_path: null,
    cover_letter_path: null,
    candidate: { full_name: "Someone", location: null, sample_key: null },
    ...fields,
  });

  beforeEach(() => {
    from.mockReturnValue({ select: applicantsSelect });
  });

  it("answers an empty list for an id that isn't a uuid, without asking the database", async () => {
    expect(await getJobApplicants("not-a-uuid")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("reads the job's active applications, first come first", async () => {
    applicantsReturns.mockResolvedValue({ data: [], error: null });

    await getJobApplicants(JOB_ID);

    expect(from).toHaveBeenCalledWith("job_applications");
    expect(applicantsEq).toHaveBeenCalledWith("job_posting_id", JOB_ID);
    expect(applicantsIs).toHaveBeenCalledWith("withdrawn_at", null);
    expect(applicantsOrder).toHaveBeenCalledWith("applied_at", { ascending: true });
  });

  it("maps the marks and matches, and names the documents without giving their paths", async () => {
    applicantsReturns.mockResolvedValue({
      data: [
        row({
          id: "real",
          viewed_at: "2026-10-31T10:00:00+00:00",
          liked_at: "2026-10-31T10:01:00+00:00",
          matched_filters: ["Figma"],
          cv_path: "user-9/real/My CV.pdf",
          candidate: { full_name: "Real Person", location: "Novi Sad", sample_key: null },
        }),
      ],
      error: null,
    });

    const [applicant] = await getJobApplicants(JOB_ID);
    expect(applicant).toEqual({
      id: "real",
      name: "Real Person",
      location: "Novi Sad",
      appliedAt: "2026-10-31T09:00:00+00:00",
      viewed: true,
      liked: true,
      matchedFilters: ["Figma"],
      cvFileName: "My CV.pdf",
      coverLetterFileName: null,
    });
    expect(JSON.stringify(applicant)).not.toContain("user-9/");
  });

  it("gives a mock candidate's documents the landing demo's file names", async () => {
    applicantsReturns.mockResolvedValue({
      data: [
        row({
          cv_path: "mock/ana-novak/cv.pdf",
          cover_letter_path: "mock/ana-novak/cover-letter.pdf",
          candidate: { full_name: "Ana Novak", location: "Belgrade, Serbia", sample_key: "ana-novak" },
        }),
      ],
      error: null,
    });

    const [applicant] = await getJobApplicants(JOB_ID);
    expect(applicant.cvFileName).toBe("Ana_Novak_CV.pdf");
    expect(applicant.coverLetterFileName).toBe("Cover_letter_Ana_Novak.pdf");
  });

  it("orders applications made in the same instant by name", async () => {
    applicantsReturns.mockResolvedValue({
      data: [
        row({ id: "p", candidate: { full_name: "Priya Raman", location: null, sample_key: null } }),
        row({ id: "a", candidate: { full_name: "Ana Novak", location: null, sample_key: null } }),
        row({ id: "early", applied_at: "2026-10-30T09:00:00+00:00" }),
      ],
      error: null,
    });

    expect((await getJobApplicants(JOB_ID)).map((applicant) => applicant.id)).toEqual(["early", "a", "p"]);
  });

  it("throws on a database error", async () => {
    applicantsReturns.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getJobApplicants(JOB_ID)).rejects.toThrow("getJobApplicants: boom");
  });
});
