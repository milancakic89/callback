-- Editing, publishing and unpublishing a company's jobs (see features/job-publishing.md).
--
-- `published_at` is null for a draft, which is how every job starts: it is not in the insert grant
-- (job_postings_insert.sql), so a client can't make a published job, and it is not in the update
-- grant below either. Only publish_job_posting() and unpublish_job_posting() change it. Nothing
-- reads it yet: published jobs are not on the job board.
--
-- `withdrawn_at` marks an application the company withdrew when it closed the job. The candidate is
-- not told yet (no email, no in-app notice); the column is what a later notice will read.

alter table public.job_postings add column published_at timestamptz;
alter table public.job_applications add column withdrawn_at timestamptz;

-- Editing: the owner of a company can change the text of its own jobs, the demo job excepted (it is
-- private and fixed). The column grant leaves out `published_at`, `is_demo`, `company_id` and `id`.
create policy "Companies can update their jobs"
  on public.job_postings
  for update
  to authenticated
  using (
    not is_demo
    and exists (
      select 1 from public.companies c
      where c.id = job_postings.company_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    not is_demo
    and exists (
      select 1 from public.companies c
      where c.id = job_postings.company_id and c.owner_id = (select auth.uid())
    )
  );

grant update (title, description, location_raw, work_mode) on public.job_postings to authenticated;

-- Publishes one of the caller's jobs. Publishing a published job changes nothing.
--
-- Security definer because clients can't update `published_at`. The account type is read from the
-- JWT, where only the secret-key client can change it, as in ensure_employer_workspace(). The job is
-- found through the caller's own company, so another company's id answers "Job not found".
create or replace function public.publish_job_posting(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_is_demo boolean;
begin
  if v_user is null or (select auth.jwt() -> 'app_metadata' ->> 'account_type') is distinct from 'employer' then
    raise exception 'Only an employer account can publish a job' using errcode = '42501';
  end if;

  select j.is_demo into v_is_demo
  from public.job_postings j
  join public.companies c on c.id = j.company_id
  where j.id = p_job_id and c.owner_id = v_user
  for update of j;

  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if v_is_demo then
    raise exception 'The demo job stays private' using errcode = '42501';
  end if;

  update public.job_postings set published_at = now() where id = p_job_id and published_at is null;
end;
$$;

-- Unpublishes one of the caller's jobs and settles its active applications (those not withdrawn),
-- all in one transaction. `p_applicants` is what happens to them:
--   keep      nothing: they stay on the job (a pause);
--   withdraw  they get `withdrawn_at`, and stay on the job;
--   move      they go to `p_target_job_id`, another non-demo job of the same company. A candidate who
--             is already on the target isn't duplicated: that application becomes active again (its
--             earlier `applied_at` stays) and the one on this job is dropped. Applications that were
--             already withdrawn stay on this job.
-- The job stays as a draft with whatever is left; deleting it is the Delete button's job.
--
-- Returns how many active applications were withdrawn or moved (0 for keep).
-- Errors: 42501 not an employer / the demo job, P0002 job not found, 55000 the job isn't published,
-- 22023 bad `p_applicants` or target.
create or replace function public.unpublish_job_posting(
  p_job_id uuid,
  p_applicants text,
  p_target_job_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_company_id uuid;
  v_is_demo boolean;
  v_published_at timestamptz;
  v_target_is_demo boolean;
  v_count integer := 0;
begin
  if v_user is null or (select auth.jwt() -> 'app_metadata' ->> 'account_type') is distinct from 'employer' then
    raise exception 'Only an employer account can unpublish a job' using errcode = '42501';
  end if;
  if p_applicants is null or p_applicants not in ('keep', 'withdraw', 'move') then
    raise exception 'p_applicants must be keep, withdraw or move' using errcode = '22023';
  end if;

  select j.company_id, j.is_demo, j.published_at into v_company_id, v_is_demo, v_published_at
  from public.job_postings j
  join public.companies c on c.id = j.company_id
  where j.id = p_job_id and c.owner_id = v_user
  for update of j;

  if not found then
    raise exception 'Job not found' using errcode = 'P0002';
  end if;
  if v_is_demo then
    raise exception 'The demo job stays private' using errcode = '42501';
  end if;
  if v_published_at is null then
    raise exception 'This job is not published' using errcode = '55000';
  end if;

  if p_applicants = 'withdraw' then
    update public.job_applications
    set withdrawn_at = now()
    where job_posting_id = p_job_id and withdrawn_at is null;
    get diagnostics v_count = row_count;

  elsif p_applicants = 'move' then
    if p_target_job_id is null or p_target_job_id = p_job_id then
      raise exception 'Choose another job to move the applicants to' using errcode = '22023';
    end if;

    -- Another job of the same company, found through the caller's company, and locked.
    select t.is_demo into v_target_is_demo
    from public.job_postings t
    where t.id = p_target_job_id and t.company_id = v_company_id
    for update of t;

    if not found or v_target_is_demo then
      raise exception 'Choose another of your jobs to move the applicants to' using errcode = '22023';
    end if;

    select count(*) into v_count
    from public.job_applications
    where job_posting_id = p_job_id and withdrawn_at is null;

    -- Candidates already on the target: their application there is active again, this one is dropped.
    update public.job_applications t
    set withdrawn_at = null
    from public.job_applications s
    where s.job_posting_id = p_job_id and s.withdrawn_at is null
      and t.job_posting_id = p_target_job_id and t.candidate_id = s.candidate_id;

    delete from public.job_applications s
    where s.job_posting_id = p_job_id and s.withdrawn_at is null
      and exists (
        select 1 from public.job_applications t
        where t.job_posting_id = p_target_job_id and t.candidate_id = s.candidate_id
      );

    -- Everyone else keeps their application (and its id), now on the target.
    update public.job_applications
    set job_posting_id = p_target_job_id
    where job_posting_id = p_job_id and withdrawn_at is null;
  end if;

  update public.job_postings set published_at = null where id = p_job_id;

  return v_count;
end;
$$;

-- Only a signed-in client may call them (they still refuse anyone who isn't an employer).
revoke execute on function public.publish_job_posting(uuid) from public, anon;
grant execute on function public.publish_job_posting(uuid) to authenticated;

revoke execute on function public.unpublish_job_posting(uuid, text, uuid) from public, anon;
grant execute on function public.unpublish_job_posting(uuid, text, uuid) to authenticated;
