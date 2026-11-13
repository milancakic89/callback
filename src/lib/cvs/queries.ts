import "server-only";
import { effectiveStatus } from "@/lib/interviews/schedule";
import { isInterviewStatus, type CandidateInterview } from "@/lib/interviews/types";
import type { PipelineStage } from "@/lib/review/stages";
import { createClient } from "@/lib/supabase/server";
import { CALLBACK_APPLICATION_STATES, type CallbackApplication, type CallbackApplicationState, type CandidateCv } from "./types";

type CvRow = { id: string; file_name: string; size_bytes: number; created_at: string; active_on: string[] | null };

type CallbackApplicationRow = {
  id: string;
  job_id: string;
  title: string;
  company_name: string | null;
  applied_at: string;
  state: string;
  cv_file_name: string | null;
  cover_letter_kind: "text" | "pdf" | null;
  cover_letter_text: string | null;
  stage: PipelineStage;
  step_name: string | null;
  step_description: string | null;
  stage_at: string | null;
  step_updated_at: string | null;
  interview_id: string | null;
  interview_status: string | null;
  interview_starts_at: string | null;
  interview_duration_minutes: number | null;
  interview_time_zone: string | null;
  interview_expires_at: string | null;
  interview_message: string | null;
  interview_meet_url: string | null;
};

// The signed-in candidate's CVs, newest first (features/candidate-cvs.md). Not cached: per user. The
// function answers only about the caller and gives no storage keys
// (supabase/migrations/20261109150000_candidate_cvs.sql).
export async function getMyCvs(): Promise<CandidateCv[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_cvs");
  if (error) throw new Error(`getMyCvs: ${error.message}`);
  return ((data ?? []) as CvRow[]).map((row) => ({
    id: row.id,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    activeOn: row.active_on ?? [],
  }));
}

function toState(value: string): CallbackApplicationState {
  return (CALLBACK_APPLICATION_STATES as readonly string[]).includes(value) ? (value as CallbackApplicationState) : "active";
}

// The invitation of an application, if it has an open or answered one and the application is still
// active. A pending one past its deadline reads as expired (my_job_applications() does the same, this
// covers the moment between the query and the page).
function toInterview(row: CallbackApplicationRow, state: CallbackApplicationState): CandidateInterview | null {
  if (state === "withdrawn" || state === "you_withdrew") return null;
  if (!row.interview_id || !isInterviewStatus(row.interview_status) || !row.interview_starts_at) return null;
  if (!row.interview_expires_at || !row.interview_time_zone || row.interview_duration_minutes === null) return null;
  return {
    id: row.interview_id,
    status: effectiveStatus(row.interview_status, row.interview_expires_at, new Date()),
    startsAt: row.interview_starts_at,
    durationMinutes: row.interview_duration_minutes,
    timeZone: row.interview_time_zone,
    expiresAt: row.interview_expires_at,
    message: row.interview_message,
    meetUrl: row.interview_meet_url,
  };
}

// The signed-in candidate's applications to jobs posted on Callback, newest first, for
// /applications. None of the company's own marks (liked, viewed, screening) are in it, and the status is
// only the one the company has applied (features/candidate-steps.md), not the one it has chosen.
export async function getMyCallbackApplications(): Promise<CallbackApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_job_applications");
  if (error) throw new Error(`getMyCallbackApplications: ${error.message}`);
  return ((data ?? []) as CallbackApplicationRow[]).map((row) => {
    const state = toState(row.state);
    return {
      id: row.id,
      jobId: row.job_id,
      title: row.title,
      companyName: row.company_name ?? "A company",
      appliedAt: row.applied_at,
      state,
      cvFileName: row.cv_file_name,
      coverLetter:
        row.cover_letter_kind === "pdf"
          ? { kind: "pdf" }
          : row.cover_letter_kind === "text" && row.cover_letter_text
            ? { kind: "text", text: row.cover_letter_text }
            : null,
      status:
        state === "withdrawn" || state === "you_withdrew"
          ? null
          : {
              stage: row.stage,
              stepName: row.step_name,
              stepDescription: row.step_description,
              stageAt: row.stage_at,
              stepUpdatedAt: row.step_updated_at,
            },
      interview: toInterview(row, state),
    };
  });
}

// The signed-in candidate's application to one posted job, or null: what the job's own page shows of it
// (features/callback-applications-in-table.md). Not cached: per user.
export async function getMyCallbackApplicationFor(jobId: string): Promise<CallbackApplication | null> {
  const applications = await getMyCallbackApplications();
  return applications.find((application) => application.jobId === jobId) ?? null;
}
