-- Published jobs on the job board, and applying to them (see features/apply-with-cv.md).
--
-- Nothing here gives a client a way to write: a candidate has no insert privilege on
-- `job_applications` or `candidate_profiles` (employer_jobs.sql granted `select` only), and keeps
-- none. The Server Action `applyToJob` checks the job and the candidate, then inserts with the secret
-- key, so the file paths in an application always come from the server. What a client gets is two
-- read-only functions.

-- The jobs companies have published, for the job board and a posting's own page: published, not the
-- demo job, and from a company that has been set up (features/company-slugs.md; a company with no
-- name has not chosen how candidates see it). `anon` can call it, so a guest sees them.
--
-- It returns what a candidate may see of a posting and nothing else: no CV filters, no `is_demo`, no
-- counts of applicants (features/job-filters.md: the filters are private to the company). Security
-- definer because `job_postings` has no policy for anyone but the owning company. `p_job_id` narrows
-- it to one job, for a posting's page.
create or replace function public.published_job_postings(p_job_id uuid default null)
returns table (
  id uuid,
  title text,
  description text,
  location_raw text,
  work_mode public.work_mode,
  published_at timestamptz,
  company_name text,
  company_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.title, j.description, j.location_raw, j.work_mode, j.published_at, c.name, c.slug
  from public.job_postings j
  join public.companies c on c.id = j.company_id
  where j.published_at is not null
    and not j.is_demo
    and c.name is not null
    and c.slug is not null
    and (p_job_id is null or j.id = p_job_id)
  order by j.published_at desc, j.id;
$$;

revoke execute on function public.published_job_postings(uuid) from public;
grant execute on function public.published_job_postings(uuid) to anon, authenticated;

-- When the caller applied to a job, or null. A candidate has no access to `job_applications` rows,
-- which also hold the company's own marks (`liked_at`, `viewed_at`, `matched_filters`, `stage`), so
-- this answers the one thing the posting's page needs: "You applied on …". A withdrawn application
-- still counts: the candidate applied, and can't apply again.
create or replace function public.my_job_application(p_job_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select a.applied_at
  from public.job_applications a
  where a.job_posting_id = p_job_id
    and a.candidate_id = (select auth.uid());
$$;

revoke execute on function public.my_job_application(uuid) from public, anon;
grant execute on function public.my_job_application(uuid) to authenticated;
