-- Interview invitations (features/interview-invitations.md): a company marks some of its candidate
-- steps as interviews, and when it applies a candidate to one it can send an invitation: a Google Meet
-- event in the company's own calendar, and an email to the candidate to confirm or decline. Callback
-- keeps the answer: confirmed, declined or no response.

-- `/interviews/{id}` is a top-level route now, so no company may be called "interviews". Same list as
-- company_slugs.sql plus the new word; company.test.ts reads the newest definition of this function.
-- `create or replace` keeps the grants of 20261109170000_company_profile_slug_check.sql.
create or replace function public.company_slug_valid(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
    and p_slug <> all (array[
      'about', 'account', 'admin', 'api', 'app', 'applications', 'apply', 'assets', 'auth',
      'blog', 'callback', 'candidate', 'candidates', 'careers', 'companies', 'company', 'contact',
      'dashboard', 'dev', 'docs', 'edit', 'employer', 'employers', 'favicon', 'forgot-password',
      'help', 'home', 'interviews', 'jobs', 'login', 'logout', 'new', 'pricing', 'privacy', 'profile',
      'public', 'reset-password', 'review', 'robots', 'saved', 'saved-jobs', 'search', 'settings',
      'setup', 'sign-in', 'sign-out', 'sign-up', 'signin', 'signup', 'sitemap', 'static', 'status',
      'support', 'terms', 'test', 'www'
    ]);
$$;

-- A step the company uses for interviews: moving a candidate to it offers to send an invitation.
alter table public.company_steps
  add column schedules_interview boolean not null default false;

-- save_company_steps() with `schedules_interview` in each item. Same signature and rules as in
-- 20261109180000_candidate_steps.sql; the flag does not count as an edit of the step's text, so it does
-- not move `updated_at` (the candidate is only told when the name or the text changed).
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
  v_schedules boolean;
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
    v_schedules := coalesce((v_item.value ->> 'schedules_interview')::boolean, false);

    if v_id is null then
      insert into public.company_steps (company_id, position, name, description, schedules_interview)
      values (v_company_id, v_item.position, v_name, v_description, v_schedules);
    else
      update public.company_steps
      set position = v_item.position,
          updated_at = case
            when (name, description) is distinct from (v_name, v_description) then now()
            else updated_at
          end,
          name = v_name,
          description = v_description,
          schedules_interview = v_schedules
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

revoke execute on function public.save_company_steps(jsonb) from public, anon;
grant execute on function public.save_company_steps(jsonb) to authenticated;

-- The company's Google account, for the calendar events. Only the refresh token is kept, encrypted by
-- the app (AES-256-GCM, src/lib/google/seal.ts), so a copy of the table is not a way into a calendar.
-- RLS on with no policy and no grant: only the secret-key client reads or writes it, after the server
-- has checked who the caller's company is. `broken_at` is when Google last refused the token, which the
-- settings page shows as "Reconnect".
create table public.google_calendar_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  google_email text not null,
  refresh_token_ciphertext text not null,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  broken_at timestamptz
);

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;

create type public.interview_status as enum ('pending', 'confirmed', 'declined', 'expired', 'cancelled');

-- An invitation to one application. The candidate answers with a link that carries a token; only its
-- sha-256 is stored, so the table can't be used to answer for anyone.
create table public.interview_invitations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  step_id uuid references public.company_steps (id) on delete set null,
  starts_at timestamptz not null,
  duration_minutes smallint not null,
  -- The zone the employer chose the time in: the email and the event show the time in it.
  time_zone text not null,
  message text,
  status public.interview_status not null default 'pending',
  -- The answer is due by then: 48 hours after sending, and at the latest 2 hours before the interview.
  expires_at timestamptz not null,
  token_hash bytea not null unique,
  responded_at timestamptz,
  google_event_id text,
  meet_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint interview_invitations_duration_valid check (duration_minutes between 15 and 240),
  constraint interview_invitations_message_valid check (message is null or char_length(message) between 1 and 1000),
  constraint interview_invitations_deadline_valid check (
    expires_at > created_at and expires_at <= starts_at - interval '2 hours'
  )
);

-- At most one invitation is open on an application; a new one can be sent once it is answered,
-- expired or cancelled.
create unique index interview_invitations_one_open
  on public.interview_invitations (application_id) where status in ('pending', 'confirmed');
create index interview_invitations_company_id_idx on public.interview_invitations (company_id);
create index interview_invitations_step_id_idx on public.interview_invitations (step_id) where step_id is not null;
-- What the expiry job looks for.
create index interview_invitations_pending_expires_idx
  on public.interview_invitations (expires_at) where status = 'pending';

alter table public.interview_invitations enable row level security;

create policy "Owners can read their interviews"
  on public.interview_invitations
  for select
  to authenticated
  using (company_id in (select id from public.companies where owner_id = (select auth.uid())));

-- Reads only, and not every column: never the token's hash or Google's event id. The candidate reads
-- their own through my_job_applications() (candidates can't select job_applications), and every write
-- is one of the functions below or the secret-key client.
revoke all on public.interview_invitations from anon, authenticated;
grant select (
  id, application_id, company_id, step_id, starts_at, duration_minutes, time_zone, message, status,
  expires_at, responded_at, meet_url, created_at
) on public.interview_invitations to authenticated;

-- Opens an invitation for an application the caller's company may invite: active, the candidate has
-- been shown an interview step ("Apply statuses" first), and a real candidate (the demo job's are
-- mock). `p_token_hash` is the sha-256 of the token the server put in the email. Errors the Server
-- Action maps to a message:
--   P0002  not the caller's application, withdrawn, or a demo candidate  (application_not_found)
--   P0001  the candidate isn't on an interview step                       (not_interview_step)
--   23514  the time or the length is out of range, or the message too long
--   22023  unknown time zone
--   23505  an invitation is already open on this application
create or replace function public.create_interview_invitation(
  p_application_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_time_zone text,
  p_message text,
  p_token_hash bytea
)
returns table (invitation_id uuid, deadline timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_step_id uuid;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_deadline timestamptz;
  v_id uuid;
begin
  select co.id, a.candidate_step_id into v_company_id, v_step_id
  from public.job_applications a
  join public.job_postings j on j.id = a.job_posting_id
  join public.companies co on co.id = j.company_id
  join public.candidate_profiles cp on cp.user_id = a.candidate_id
  where a.id = p_application_id
    and co.owner_id = (select auth.uid())
    and a.withdrawn_at is null
    and cp.sample_key is null;
  if v_company_id is null then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  if v_step_id is null or not exists (
    select 1 from public.company_steps s where s.id = v_step_id and s.schedules_interview
  ) then
    raise exception 'not_interview_step' using errcode = 'P0001';
  end if;

  if p_duration_minutes is null or p_duration_minutes not between 15 and 240 then
    raise exception 'The interview must last 15 to 240 minutes' using errcode = '23514';
  end if;
  -- Three hours, so there is a window to answer in; and not further than a quarter ahead.
  if p_starts_at is null or p_starts_at < now() + interval '3 hours' or p_starts_at > now() + interval '90 days' then
    raise exception 'The interview must start 3 hours to 90 days from now' using errcode = '23514';
  end if;
  if v_message is not null and char_length(v_message) > 1000 then
    raise exception 'The message is too long' using errcode = '23514';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_time_zone) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;

  v_deadline := least(now() + interval '48 hours', p_starts_at - interval '2 hours');

  insert into public.interview_invitations as iv
    (application_id, company_id, step_id, starts_at, duration_minutes, time_zone, message, expires_at, token_hash, created_by)
  values
    (p_application_id, v_company_id, v_step_id, p_starts_at, p_duration_minutes, p_time_zone, v_message,
     v_deadline, p_token_hash, (select auth.uid()))
  returning iv.id into v_id;

  return query select v_id, v_deadline;
end;
$$;

-- Cancels an open invitation of the caller's company. Returns Google's event id, so the server can
-- delete the event, and whether the candidate had confirmed (then Google tells them it was cancelled).
create or replace function public.cancel_interview_invitation(p_invitation_id uuid)
returns table (event_id text, was_confirmed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_confirmed boolean;
  v_event text;
begin
  select iv.status = 'confirmed', iv.google_event_id into v_was_confirmed, v_event
  from public.interview_invitations iv
  join public.companies co on co.id = iv.company_id
  where iv.id = p_invitation_id
    and co.owner_id = (select auth.uid())
    and iv.status in ('pending', 'confirmed')
  for update of iv;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  update public.interview_invitations set status = 'cancelled' where id = p_invitation_id;

  return query select v_event, v_was_confirmed;
end;
$$;

revoke execute on function public.create_interview_invitation(uuid, timestamptz, integer, text, text, bytea) from public, anon;
revoke execute on function public.cancel_interview_invitation(uuid) from public, anon;
grant execute on function public.create_interview_invitation(uuid, timestamptz, integer, text, text, bytea) to authenticated;
grant execute on function public.cancel_interview_invitation(uuid) to authenticated;

-- The candidate's applications now carry their latest open or answered invitation (never a cancelled
-- one). A new return type, so the function is dropped and made again, as in candidate_steps.sql; the
-- deployed code ignores the extra columns. A `pending` invitation past its deadline reads as `expired`
-- even before the expiry job has run. The Meet link is given only once the candidate has confirmed.
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
  step_updated_at timestamptz,
  interview_id uuid,
  interview_status text,
  interview_starts_at timestamptz,
  interview_duration_minutes integer,
  interview_time_zone text,
  interview_expires_at timestamptz,
  interview_message text,
  interview_meet_url text
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
    st.updated_at,
    iv.id,
    case when iv.status = 'pending' and iv.expires_at <= now() then 'expired' else iv.status::text end,
    iv.starts_at,
    iv.duration_minutes::integer,
    iv.time_zone,
    iv.expires_at,
    iv.message,
    case when iv.status = 'confirmed' then iv.meet_url end
  from public.job_applications a
  join public.job_postings j on j.id = a.job_posting_id
  join public.companies co on co.id = j.company_id
  left join public.candidate_cvs cv on cv.id = a.cv_id
  left join public.company_steps st on st.id = a.candidate_step_id
  left join lateral (
    select i.id, i.status, i.starts_at, i.duration_minutes, i.time_zone, i.expires_at, i.message, i.meet_url
    from public.interview_invitations i
    where i.application_id = a.id and i.status <> 'cancelled'
    order by i.created_at desc
    limit 1
  ) iv on true
  where a.candidate_id = (select auth.uid())
  order by a.applied_at desc, a.id;
$$;

revoke execute on function public.my_job_applications() from public, anon;
grant execute on function public.my_job_applications() to authenticated;
