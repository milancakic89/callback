-- One row per (user, job) the user marked as applied, for the dashboard's Applied checkbox
-- (see features/dashboard.md). Phase 4 extends this with status and notes.
create table if not exists public.applications (
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text not null references public.jobs (id) on delete cascade,
  applied_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.applications enable row level security;

create policy "Users can read their own applications"
  on public.applications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can mark a job as applied"
  on public.applications
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can unmark a job as applied"
  on public.applications
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- RLS does not cover TRUNCATE, so drop every privilege except the three granted below.
revoke all on public.applications from anon, authenticated;
grant select, insert, delete on public.applications to authenticated;
