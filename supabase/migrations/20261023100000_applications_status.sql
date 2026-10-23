-- Status for an application, and one-way applying (see features/applied.md).
create type public.application_status as enum ('PENDING', 'NO_ANSWER', 'REJECTED', 'OFFER');

-- Existing rows become PENDING.
alter table public.applications
  add column status public.application_status not null default 'PENDING';

-- Applying is irreversible: no client can delete a row, whatever the UI does.
drop policy "Users can unmark a job as applied" on public.applications;
revoke delete on public.applications from authenticated;

-- Status is the only column a user can change; job_id, user_id and applied_at stay fixed.
create policy "Users can update the status of their own applications"
  on public.applications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant update (status) on public.applications to authenticated;

-- /applications keeps showing jobs the scraper has marked inactive. Permissive policies are OR'd
-- with "Active jobs are public", so anon still sees only active jobs.
create policy "Users can read jobs they applied to"
  on public.jobs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.job_id = jobs.id and a.user_id = (select auth.uid())
    )
  );
