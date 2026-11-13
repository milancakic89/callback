-- Indexes for the queries that slow down as the data grows (features/performance.md).
--
-- Additive and safe to run on a live database: nothing is dropped or changed, and the tables are
-- small enough in production for the build to take a moment. `if not exists`, so running it twice
-- (or after an index of the same name was made by hand) does nothing.

-- Reviewing a job's applicants (getJobApplicants, src/lib/companies/workspace.ts) embeds each
-- application's interview invitations: `where application_id = ...`, once per applicant. The only
-- index on that column is the partial one for open invitations (pending or confirmed), which the
-- planner can't use for "all of them", so the embed read the whole table for every applicant.
-- Measured with 10,000 companies (1.87M applications, 351k invitations): 4.5 s without this index,
-- about 4 ms with it. Production's statement_timeout is 8 s for `authenticated`, so past a few
-- thousand companies the page would have failed instead of being slow.
create index if not exists interview_invitations_application_id_idx
  on public.interview_invitations (application_id);

-- The two foreign keys to `jobs` whose own column comes second in the primary key (user_id, job_id),
-- so nothing can seek by job: Supabase's performance advisor reports them as unindexed foreign keys.
-- They matter when the scraper deletes a job, which cascades to every row that points at it.
create index if not exists applications_job_id_idx on public.applications (job_id);
create index if not exists saved_jobs_job_id_idx on public.saved_jobs (job_id);
