-- CVs on the candidate's account (see features/candidate-cvs.md).
--
-- A candidate keeps up to 5 CVs (PDFs in R2) on their account, and an application points to one of
-- them. The rule everything below follows: **an active application (`withdrawn_at is null`) holds
-- documents, a withdrawn one holds none.** While an application is active its CV can't be deleted
-- (the foreign key refuses, 23503) and the company can read it; withdrawing, by either side, clears
-- the documents in the same update, which unlocks the CV and ends the company's access.
--
-- Candidates still never write to a table: the Server Actions write with the secret key, and
-- candidates read through the functions at the end.

-- The CVs. `storage_key` is the object's key in the R2 bucket, candidates/{user}/cvs/{id}/{name}.pdf
-- (candidateCvPath() in src/lib/review/documents.ts); `file_name` is its cleaned name, for showing.
-- No client role has any privilege: the server writes with the secret key, and the candidate reads
-- their own through my_cvs().
create table public.candidate_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 100),
  storage_key text not null unique,
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now()
);

create index candidate_cvs_user_id_idx on public.candidate_cvs (user_id);

alter table public.candidate_cvs enable row level security;
revoke all on public.candidate_cvs from anon, authenticated;

-- At most 5 CVs a candidate. The lock on the user makes two uploads at once wait for each other, so
-- both can't see 4 and become the 5th and 6th. The Server Action answers 54000 with "You can keep up
-- to 5 CVs".
create or replace function public.candidate_cvs_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('candidate_cvs:' || new.user_id::text, 0));
  if (select count(*) from public.candidate_cvs where user_id = new.user_id) >= 5 then
    raise exception 'A candidate keeps at most 5 CVs' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke execute on function public.candidate_cvs_limit() from public, anon, authenticated;

create trigger candidate_cvs_limit
  before insert on public.candidate_cvs
  for each row execute function public.candidate_cvs_limit();

-- What an application holds.
--   cv_id              the CV on the candidate's account. `no action`, not `restrict`: it is checked
--                      at the end of the statement, so deleting an account (which cascades to both
--                      the applications and the CVs) still works.
--   cv_path            stays a copy of that CV's storage key, so the document route, the re-check and
--                      fileName() in src/lib/companies/workspace.ts read it as before.
--   cover_letter_text  a cover letter typed in the form, instead of a PDF.
--   withdrawn_by       who withdrew it: the company (unpublishing with "withdraw") or the candidate.
alter table public.job_applications
  add column cv_id uuid references public.candidate_cvs (id),
  add column cover_letter_text text check (char_length(cover_letter_text) between 1 and 5000),
  add column withdrawn_by text check (withdrawn_by in ('company', 'candidate'));

create index job_applications_cv_id_idx on public.job_applications (cv_id);

-- Files to delete from R2. SQL can't call R2, so the triggers below queue the keys a row lets go of,
-- and drainStorageDeletions() (src/lib/storage/deletions.ts) deletes them after the response of
-- every action that withdraws or deletes. A failed delete stays queued for the next drain. Only the
-- secret key reads or writes it.
create table public.storage_deletions (
  key text primary key,
  queued_at timestamptz not null default now()
);

alter table public.storage_deletions enable row level security;
revoke all on public.storage_deletions from anon, authenticated;

-- An application's own files, applications/{id}/…, once no application points to them any more.
-- Never mock/… (the demo PDFs every company's demo job shares) and never candidates/… (that is the
-- candidate's CV, which goes when the CV is deleted). The "still pointed to" check is for a move,
-- where an application the company had withdrawn takes over the documents of the one that is then
-- dropped. Triggers also fire on cascades, so deleting a job, a company or an account is covered.
-- Security definer: the employer's own client updates job_applications (viewed, liked, stage), and
-- no client role may write the queue.
create or replace function public.queue_application_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_deletions (key)
  select k
  from unnest(array[old.cv_path, old.cover_letter_path]) as k
  where k like 'applications/%'
    and (tg_op = 'DELETE' or (k is distinct from new.cv_path and k is distinct from new.cover_letter_path))
    and not exists (
      select 1 from public.job_applications a where a.cv_path = k or a.cover_letter_path = k
    )
  on conflict (key) do nothing;
  return null;
end;
$$;

revoke execute on function public.queue_application_documents() from public, anon, authenticated;

create trigger job_applications_queue_documents
  after delete or update of cv_path, cover_letter_path on public.job_applications
  for each row execute function public.queue_application_documents();

create or replace function public.queue_candidate_cv()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.storage_deletions (key) values (old.storage_key) on conflict (key) do nothing;
  return null;
end;
$$;

revoke execute on function public.queue_candidate_cv() from public, anon, authenticated;

create trigger candidate_cvs_queue_file
  after delete on public.candidate_cvs
  for each row execute function public.queue_candidate_cv();

-- Applications withdrawn before this migration were all withdrawn by a company, and give up their
-- documents now (their own files are queued by the trigger above).
update public.job_applications
set withdrawn_by = 'company', cv_id = null, cv_path = null, cover_letter_path = null, cover_letter_text = null
where withdrawn_at is not null;

alter table public.job_applications
  add constraint job_applications_one_cover_letter
    check (cover_letter_path is null or cover_letter_text is null),
  add constraint job_applications_withdrawn_by_set
    check ((withdrawn_at is null) = (withdrawn_by is null)),
  add constraint job_applications_withdrawn_holds_no_documents
    check (
      withdrawn_at is null
      or (cv_id is null and cv_path is null and cover_letter_path is null and cover_letter_text is null)
    );

-- As in 20261030140000_job_publishing.sql, same signature, with the documents settled:
--   keep      nothing changes: the CVs stay locked and the company keeps access (a pause);
--   withdraw  the applications are withdrawn by the company and give up their documents;
--   move      they go to `p_target_job_id`. For a candidate already on the target:
--               - an active application there stays as it is, and this one is dropped;
--               - one the company withdrew takes this one's documents and is active again, its
--                 screening cleared (the re-check after a move fills it in), and this one is dropped;
--               - one the candidate withdrew is never reopened: this one is withdrawn instead.
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
    set withdrawn_at = now(), withdrawn_by = 'company',
        cv_id = null, cv_path = null, cover_letter_path = null, cover_letter_text = null
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

    -- The candidate withdrew from the target: they are never put back on it. Their application here
    -- is withdrawn instead, and stays on this job.
    update public.job_applications s
    set withdrawn_at = now(), withdrawn_by = 'company',
        cv_id = null, cv_path = null, cover_letter_path = null, cover_letter_text = null
    where s.job_posting_id = p_job_id and s.withdrawn_at is null
      and exists (
        select 1 from public.job_applications t
        where t.job_posting_id = p_target_job_id and t.candidate_id = s.candidate_id
          and t.withdrawn_by = 'candidate'
      );

    -- The company withdrew the target: it is active again, with this application's documents (its
    -- earlier `applied_at` stays). Its old screening was for other documents.
    update public.job_applications t
    set withdrawn_at = null, withdrawn_by = null,
        cv_id = s.cv_id, cv_path = s.cv_path,
        cover_letter_path = s.cover_letter_path, cover_letter_text = s.cover_letter_text,
        matched_filters = null, unverified_filters = null, screening_outcome = null,
        screened_at = null, screening_engine = null
    from public.job_applications s
    where s.job_posting_id = p_job_id and s.withdrawn_at is null
      and t.job_posting_id = p_target_job_id and t.candidate_id = s.candidate_id
      and t.withdrawn_by = 'company';

    -- Candidates now active on the target: the application here is dropped.
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

revoke execute on function public.unpublish_job_posting(uuid, text, uuid) from public, anon;
grant execute on function public.unpublish_job_posting(uuid, text, uuid) to authenticated;

-- The candidate's side. Each answers only about the caller, and returns none of the company's own
-- marks (liked, viewed, stage, screening) and no storage keys, except my_application_document_path(),
-- which the document route needs and which only answers about the caller's own active application.

-- The caller's CVs, newest first, with the jobs each is locked by ("Title at Company"), for the
-- "Your CVs" page and the apply dialog.
create or replace function public.my_cvs()
returns table (id uuid, file_name text, size_bytes integer, created_at timestamptz, active_on text[])
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.file_name, c.size_bytes, c.created_at,
    coalesce(
      (
        select array_agg(j.title || ' at ' || coalesce(co.name, 'a company') order by a.applied_at)
        from public.job_applications a
        join public.job_postings j on j.id = a.job_posting_id
        join public.companies co on co.id = j.company_id
        where a.cv_id = c.id and a.withdrawn_at is null
      ),
      '{}'
    )
  from public.candidate_cvs c
  where c.user_id = (select auth.uid())
  order by c.created_at desc, c.id;
$$;

-- The caller's applications to jobs posted on Callback, newest first, for /applications.
--   state  active        the job is published and the application isn't withdrawn;
--          paused        the company unpublished the job and kept the applicants;
--          withdrawn     the company withdrew it;
--          you_withdrew  the candidate did.
create or replace function public.my_job_applications()
returns table (
  id uuid,
  job_id uuid,
  title text,
  company_name text,
  applied_at timestamptz,
  state text,
  cv_file_name text,
  cover_letter_kind text,
  cover_letter_text text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.job_posting_id, j.title, co.name, a.applied_at,
    case
      when a.withdrawn_by = 'candidate' then 'you_withdrew'
      when a.withdrawn_at is not null then 'withdrawn'
      when j.published_at is null then 'paused'
      else 'active'
    end,
    coalesce(cv.file_name, nullif(regexp_replace(coalesce(a.cv_path, ''), '^.*/', ''), '')),
    case
      when a.cover_letter_path is not null then 'pdf'
      when a.cover_letter_text is not null then 'text'
    end,
    a.cover_letter_text
  from public.job_applications a
  join public.job_postings j on j.id = a.job_posting_id
  join public.companies co on co.id = j.company_id
  left join public.candidate_cvs cv on cv.id = a.cv_id
  where a.candidate_id = (select auth.uid())
  order by a.applied_at desc, a.id;
$$;

-- The candidate withdraws their own active application. The company loses access, the CV is
-- unlocked and the cover letter is given up (queued for deletion). Returns false when there is no
-- such application: another candidate's, an unknown id, or one already withdrawn.
create or replace function public.withdraw_my_application(p_application_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job_applications
  set withdrawn_at = now(), withdrawn_by = 'candidate',
      cv_id = null, cv_path = null, cover_letter_path = null, cover_letter_text = null
  where id = p_application_id
    and candidate_id = (select auth.uid())
    and withdrawn_at is null;
  return found;
end;
$$;

-- Where one of the caller's own active applications keeps a document ('cv' or 'cover-letter'), for
-- the document route; null for anything else.
create or replace function public.my_application_document_path(p_application_id uuid, p_kind text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind when 'cv' then a.cv_path when 'cover-letter' then a.cover_letter_path end
  from public.job_applications a
  where a.id = p_application_id
    and a.candidate_id = (select auth.uid())
    and a.withdrawn_at is null;
$$;

revoke execute on function public.my_cvs() from public, anon;
revoke execute on function public.my_job_applications() from public, anon;
revoke execute on function public.withdraw_my_application(uuid) from public, anon;
revoke execute on function public.my_application_document_path(uuid, text) from public, anon;
grant execute on function public.my_cvs() to authenticated;
grant execute on function public.my_job_applications() to authenticated;
grant execute on function public.withdraw_my_application(uuid) to authenticated;
grant execute on function public.my_application_document_path(uuid, text) to authenticated;
