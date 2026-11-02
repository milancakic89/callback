-- The status of an application on the employer's side (features/application-status.md), set on the
-- review screen. `application_status` is already the candidate-side tracker's, so this is a stage.
-- Any stage can change to any other. Changing one tells the candidate nothing yet.

create type public.hiring_stage as enum ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

alter table public.job_applications
  add column stage public.hiring_stage not null default 'APPLIED',
  -- When the stage last changed; null until the first change.
  add column stage_changed_at timestamptz;

-- "Companies can update applications to their jobs" (20261031120000_applicant_review.sql) already
-- limits this to the job's owner and to active applications. Every other column stays out of reach.
grant update (stage, stage_changed_at) on public.job_applications to authenticated;
