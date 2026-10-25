-- One row per (user, job) the user saved, for the dashboard's Save job heart and the /saved-jobs
-- page (see features/saved-jobs.md). Unlike applications, saving toggles both ways.
create table public.saved_jobs (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null references public.jobs (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.saved_jobs enable row level security;

create policy "Users can read their saved jobs"
  on public.saved_jobs
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can save a job"
  on public.saved_jobs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can unsave a job"
  on public.saved_jobs
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- RLS does not cover TRUNCATE, so drop every privilege except the three granted below.
revoke all on public.saved_jobs from anon, authenticated;
grant select, insert, delete on public.saved_jobs to authenticated;

-- /saved-jobs keeps showing jobs the scraper has marked inactive. Permissive policies are OR'd
-- with "Active jobs are public", so anon still sees only active jobs.
create policy "Users can read jobs they saved"
  on public.jobs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.saved_jobs s
      where s.job_id = jobs.id and s.user_id = (select auth.uid())
    )
  );
