-- Lets an employer publish a job from the "Create job" form (see features/post-job.md).
-- job_postings had only select and delete for companies (employer_jobs.sql); this adds insert.
--
-- Two limits keep it narrow: the policy only lets a company insert into its own row in `companies`
-- (a candidate has none), and the grant is on columns, so a client can never set `is_demo`, `id`
-- or `created_at`. The demo job is still made only by ensure_employer_workspace().

create policy "Companies can insert their jobs"
  on public.job_postings
  for insert
  to authenticated
  with check (
    not is_demo
    and exists (
      select 1 from public.companies c
      where c.id = job_postings.company_id and c.owner_id = (select auth.uid())
    )
  );

-- Column grants add to the table-level ones above (select, delete); employer_jobs.sql revoked
-- everything else, so nothing else is insertable.
grant insert (company_id, title, description, location_raw, work_mode) on public.job_postings to authenticated;

-- The same limits as the form (src/lib/companies/job-posting.ts), so the database doesn't rely on
-- the app. Lengths are in characters; the demo job and any earlier row already meet them.
alter table public.job_postings
  add constraint job_postings_title_length check (char_length(btrim(title)) between 1 and 120),
  add constraint job_postings_description_length check (char_length(description) <= 10000),
  add constraint job_postings_location_length check (location_raw is null or char_length(location_raw) <= 200);
