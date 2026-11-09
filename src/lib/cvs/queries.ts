import "server-only";
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

// The signed-in candidate's applications to jobs posted on Callback, newest first, for
// /applications. None of the company's own marks (liked, viewed, stage, screening) are in it.
export async function getMyCallbackApplications(): Promise<CallbackApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_job_applications");
  if (error) throw new Error(`getMyCallbackApplications: ${error.message}`);
  return ((data ?? []) as CallbackApplicationRow[]).map((row) => ({
    id: row.id,
    jobId: row.job_id,
    title: row.title,
    companyName: row.company_name ?? "A company",
    appliedAt: row.applied_at,
    state: toState(row.state),
    cvFileName: row.cv_file_name,
    coverLetter:
      row.cover_letter_kind === "pdf"
        ? { kind: "pdf" }
        : row.cover_letter_kind === "text" && row.cover_letter_text
          ? { kind: "text", text: row.cover_letter_text }
          : null,
  }));
}
