-- Candidate steps (features/candidate-steps.md): each company defines its own statuses between
-- Applied and Offer, up to 10, each with a text for the candidate. The employer sets an
-- application's status on the review screen; the candidate sees it only after "Apply statuses".
--
-- Additive: the old `job_applications.stage` column and `hiring_stage` type stay for the code that is
-- deployed now, and are dropped by 20261109190000_drop_hiring_stage.sql once the new code is out.

-- The company's steps, in the company's order. Clients only read them: writes go through
-- save_company_steps() below, which is where the limits that span rows (10 steps, a step in use
-- can't go) are kept.
create table public.company_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  position smallint not null,
  name text not null,
  -- What the candidate reads behind the info icon.
  description text not null,
  -- When an application was first put on this step. A step that has been used can't be deleted, only
  -- renamed or reworded.
  used_at timestamptz,
  created_at timestamptz not null default now(),
  -- When the name or the text last changed, so the candidate can be told the step was edited.
  updated_at timestamptz not null default now(),
  name_key text generated always as (lower(name)) stored,
  constraint company_steps_position_range check (position between 1 and 10),
  constraint company_steps_name_valid check (
    name = btrim(name) and char_length(name) between 1 and 60
    and name_key not in ('applied', 'offer', 'got offer', 'rejected')
  ),
  constraint company_steps_description_valid check (
    description = btrim(description) and char_length(description) between 1 and 500
  ),
  -- Deferred, so a reorder or a swap of names can pass through states that clash.
  constraint company_steps_position_unique unique (company_id, position) deferrable initially immediate,
  constraint company_steps_name_unique unique (company_id, name_key) deferrable initially immediate
);

alter table public.company_steps enable row level security;

create policy "Owners can read their steps"
  on public.company_steps
  for select
  to authenticated
  using (company_id in (select id from public.companies where owner_id = (select auth.uid())));

revoke all on public.company_steps from anon, authenticated;
grant select on public.company_steps to authenticated;

-- Where an application stands in the company's pipeline. A STEP is one of the company's own, named by
-- `step_id`.
create type public.pipeline_stage as enum ('APPLIED', 'STEP', 'OFFER', 'REJECTED');

alter table public.job_applications
  -- What the employer chose on the review screen.
  add column pipeline_stage public.pipeline_stage not null default 'APPLIED',
  add column step_id uuid references public.company_steps (id),
  -- What the candidate sees: the employer's choice at the last "Apply statuses".
  add column candidate_stage public.pipeline_stage not null default 'APPLIED',
  add column candidate_step_id uuid references public.company_steps (id),
  add column candidate_stage_at timestamptz,
  add constraint job_applications_step_matches_stage check ((pipeline_stage = 'STEP') = (step_id is not null)),
  add constraint job_applications_candidate_step_matches_stage check (
    (candidate_stage = 'STEP') = (candidate_step_id is not null)
  );

create index job_applications_step_id_idx on public.job_applications (step_id) where step_id is not null;
create index job_applications_candidate_step_id_idx
  on public.job_applications (candidate_step_id) where candidate_step_id is not null;

-- The existing update policy ("Companies can update applications to their jobs", applicant_review.sql)
-- limits this to the job's owner and to active applications. `stage_changed_at` is already granted.
-- The candidate_* columns get no grant: only apply_application_stages() writes them.
grant update (pipeline_stage, step_id) on public.job_applications to authenticated;

-- A step belongs to the company of the job, and is marked used the first time an application is put
-- on it. A move to another job of the same company (unpublish_job_posting) stays valid.
create or replace function public.check_application_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if new.step_id is null and new.candidate_step_id is null then
    return new;
  end if;

  select company_id into v_company_id from public.job_postings where id = new.job_posting_id;

  if new.step_id is not null
    and not exists (select 1 from public.company_steps where id = new.step_id and company_id = v_company_id) then
    raise exception 'That step is not one of the job''s company' using errcode = '23514';
  end if;
  if new.candidate_step_id is not null
    and not exists (select 1 from public.company_steps where id = new.candidate_step_id and company_id = v_company_id) then
    raise exception 'That step is not one of the job''s company' using errcode = '23514';
  end if;

  update public.company_steps
  set used_at = now()
  where id in (new.step_id, new.candidate_step_id) and used_at is null;

  return new;
end;
$$;

revoke execute on function public.check_application_steps() from public, anon, authenticated;

create trigger job_applications_check_steps
  before insert or update of step_id, candidate_step_id, job_posting_id on public.job_applications
  for each row execute function public.check_application_steps();

-- Existing applications. Hired is gone: it becomes Offer. Screening and Interview become steps of
-- their company, with a plain text the company can reword. Nobody was ever told a status, so the
-- candidate columns stay at Applied and these show up as not applied yet.
with used as (
  select distinct p.company_id, a.stage
  from public.job_applications a
  join public.job_postings p on p.id = a.job_posting_id
  where a.stage in ('SCREENING', 'INTERVIEW')
)
insert into public.company_steps (company_id, position, name, description)
select
  company_id,
  (row_number() over (partition by company_id order by case stage when 'SCREENING' then 1 else 2 end))::smallint,
  case stage when 'SCREENING' then 'Screening' else 'Interview' end,
  case stage
    when 'SCREENING' then 'We are reading your application.'
    else 'We would like to talk to you.'
  end
from used;

update public.job_applications
set pipeline_stage = (case stage when 'HIRED' then 'OFFER' else stage::text end)::public.pipeline_stage
where stage in ('APPLIED', 'OFFER', 'HIRED', 'REJECTED');

update public.job_applications a
set pipeline_stage = 'STEP', step_id = s.id
from public.job_postings p, public.company_steps s
where a.stage in ('SCREENING', 'INTERVIEW')
  and p.id = a.job_posting_id
  and s.company_id = p.company_id
  and s.name_key = lower(a.stage::text);

-- Saves the company's steps: the whole list, in order. Each item is {id?, name, description}; an item
-- with an id keeps that step, one without is new. A saved step missing from the list is deleted, and
-- only if no application has ever been on it (otherwise `step_in_use`, with the step's name in DETAIL).
-- Returns the saved list.
-- Errors: P0002 no company or an unknown step, 22023 not a list, 23514 more than 10 steps or a bad
-- name or text, 23505 a name used twice, P0001 `step_in_use`.
create or replace function public.save_company_steps(p_steps jsonb)
returns setof public.company_steps
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_in_use text;
  v_item record;
  v_id uuid;
  v_name text;
  v_description text;
begin
  select id into v_company_id from public.companies where owner_id = (select auth.uid());
  if v_company_id is null then
    raise exception 'Set up your company first' using errcode = 'P0002';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'The steps must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) > 10 then
    raise exception 'A company can have 10 steps at most' using errcode = '23514';
  end if;

  set constraints public.company_steps_position_unique, public.company_steps_name_unique deferred;

  select s.name into v_in_use
  from public.company_steps s
  where s.company_id = v_company_id and s.used_at is not null
    and not exists (
      select 1 from jsonb_array_elements(p_steps) as item where nullif(item ->> 'id', '')::uuid = s.id
    )
  limit 1;
  if v_in_use is not null then
    raise exception 'step_in_use' using errcode = 'P0001', detail = v_in_use;
  end if;

  delete from public.company_steps s
  where s.company_id = v_company_id
    and not exists (
      select 1 from jsonb_array_elements(p_steps) as item where nullif(item ->> 'id', '')::uuid = s.id
    );

  for v_item in
    select item.value as value, item.ordinality as position
    from jsonb_array_elements(p_steps) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    v_id := nullif(v_item.value ->> 'id', '')::uuid;
    v_name := btrim(coalesce(v_item.value ->> 'name', ''));
    v_description := btrim(coalesce(v_item.value ->> 'description', ''));

    if v_id is null then
      insert into public.company_steps (company_id, position, name, description)
      values (v_company_id, v_item.position, v_name, v_description);
    else
      update public.company_steps
      set position = v_item.position,
          updated_at = case
            when (name, description) is distinct from (v_name, v_description) then now()
            else updated_at
          end,
          name = v_name,
          description = v_description
      where id = v_id and company_id = v_company_id;
      if not found then
        raise exception 'That step is not one of yours' using errcode = 'P0002';
      end if;
    end if;
  end loop;

  -- Check the deferred constraints here, so a clash is an error of this call.
  set constraints public.company_steps_position_unique, public.company_steps_name_unique immediate;

  return query select * from public.company_steps where company_id = v_company_id order by position;
end;
$$;

-- "Apply statuses": shows the candidates the statuses the employer chose. `p_changes` is
-- [{id, stage, step_id}], what the employer saw in the confirmation. An application is only updated
-- while it still stands where the employer saw it, so a change made in another tab after the
-- confirmation opened is never sent unseen. Returns the ids it updated: active applications to this
-- job, which belongs to the caller.
create or replace function public.apply_application_stages(p_job_id uuid, p_changes jsonb)
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  update public.job_applications a
  set candidate_stage = a.pipeline_stage,
      candidate_step_id = a.step_id,
      candidate_stage_at = now()
  from jsonb_to_recordset(p_changes) as change(id uuid, stage public.pipeline_stage, step_id uuid)
  where a.id = change.id
    and a.job_posting_id = p_job_id
    and a.withdrawn_at is null
    and a.pipeline_stage = change.stage
    and a.step_id is not distinct from change.step_id
    and exists (
      select 1
      from public.job_postings j
      join public.companies c on c.id = j.company_id
      where j.id = p_job_id and c.owner_id = (select auth.uid())
    )
  returning a.id;
$$;

-- The candidate's applications now carry the status the company applied. A new return type, so the
-- function is dropped and made again (as company_profiles.sql did); the deployed code ignores the
-- extra columns. `stage` is APPLIED, STEP, OFFER or REJECTED; for a STEP, the name and text of the
-- company's step as they are now, and when the step was last edited.
drop function public.my_job_applications();

create function public.my_job_applications()
returns table (
  id uuid,
  job_id uuid,
  title text,
  company_name text,
  applied_at timestamptz,
  state text,
  cv_file_name text,
  cover_letter_kind text,
  cover_letter_text text,
  stage text,
  step_name text,
  step_description text,
  stage_at timestamptz,
  step_updated_at timestamptz
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
    a.cover_letter_text,
    a.candidate_stage::text,
    st.name,
    st.description,
    a.candidate_stage_at,
    st.updated_at
  from public.job_applications a
  join public.job_postings j on j.id = a.job_posting_id
  join public.companies co on co.id = j.company_id
  left join public.candidate_cvs cv on cv.id = a.cv_id
  left join public.company_steps st on st.id = a.candidate_step_id
  where a.candidate_id = (select auth.uid())
  order by a.applied_at desc, a.id;
$$;

revoke execute on function public.save_company_steps(jsonb) from public, anon;
revoke execute on function public.apply_application_stages(uuid, jsonb) from public, anon;
revoke execute on function public.my_job_applications() from public, anon;
grant execute on function public.save_company_steps(jsonb) to authenticated;
grant execute on function public.apply_application_stages(uuid, jsonb) to authenticated;
grant execute on function public.my_job_applications() to authenticated;
