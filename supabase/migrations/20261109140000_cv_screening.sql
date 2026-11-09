-- What the CV screening stores about an application (see features/cv-screening.md).
--
-- `matched_filters` (applicant_review.sql) already says which of the job's filters a CV meets, and is
-- null until the application is checked. Four columns say the rest. None of them is in any grant
-- (job_applications gives clients `select`, and `update` on a few marks of the company's own), so only
-- the secret key writes them, through the Server Action that applies and the re-check that follows a
-- change of the job's filters. The company reads them with the table's own select policy.
--
-- A row with `matched_filters` set and no `screening_outcome` is read as checked: that is how the demo
-- job's hand-written matches look.
alter table public.job_applications
  -- The job's filters a keyword check can't decide ("5+ years"); the reviewer reads the CV for them.
  add column unverified_filters text[],
  -- 'checked': the CV was read and every filter has an answer. 'unreadable': the CV had no text to
  -- read (a scan, a damaged file), so nothing was checked and `matched_filters` stays null.
  add column screening_outcome text check (screening_outcome in ('checked', 'unreadable')),
  add column screened_at timestamptz,
  -- Which engine wrote the result (src/lib/screening/engine.ts), so results can be told apart and
  -- redone when the engine changes.
  add column screening_engine text;

-- Writes one application's result, but only if the job still has the filters the result was made
-- for. A re-check reads the filters, then reads and checks each CV, which takes a while; an employer
-- who edits the filters in the meantime starts another re-check, and the older one must not overwrite
-- it with answers to filters that are gone. The comparison ignores the order of the filters, which
-- changes nothing about the answers. Returns whether the row was written.
--
-- Not executable by any client role: only the secret key calls it.
create or replace function public.save_screening(
  p_application_id uuid,
  p_required text[],
  p_optional text[],
  p_matched text[],
  p_unverified text[],
  p_outcome text,
  p_engine text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job_applications a
  set matched_filters = p_matched,
      unverified_filters = p_unverified,
      screening_outcome = p_outcome,
      screened_at = now(),
      screening_engine = p_engine
  from public.job_postings j
  where a.id = p_application_id
    and j.id = a.job_posting_id
    and j.required_filters <@ p_required and p_required <@ j.required_filters
    and j.optional_filters <@ p_optional and p_optional <@ j.optional_filters;
  return found;
end;
$$;

revoke execute on function public.save_screening(uuid, text[], text[], text[], text[], text, text) from public, anon, authenticated;
grant execute on function public.save_screening(uuid, text[], text[], text[], text[], text, text) to service_role;
