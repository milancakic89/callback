-- Employer workspaces, their jobs and the applicants to them (see features/demo-job.md).
-- Every company starts with one demo job and three applicants: the mock candidates, which are real
-- accounts (candidate type, sign-in blocked) created by `npm run seed:mock-candidates`.
--
-- All four tables follow saved_jobs.sql: row level security on, every privilege revoked from the
-- client roles, then only the grants that are needed. Clients never insert: companies and the demo
-- job are made by ensure_employer_workspace() below, profiles and mock accounts by the service role.

-- One row per employer account, made on the first dashboard visit. The name and a real slug come
-- later; until then the URL stays the fixture company's.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text,
  -- Set once the demo job has been made, so deleting it doesn't bring it back.
  demo_seeded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

create policy "Owners can read their company"
  on public.companies
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.companies from anon, authenticated;
grant select on public.companies to authenticated;

-- What an employer sees of a candidate. Real candidates will get a row here when they apply; the
-- mock ones are made by the seed script (`is_mock`, and `sample_key` ties them to the landing demo
-- data in src/lib/candidates/mock-candidates.ts).
create table public.candidate_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  location text,
  is_mock boolean not null default false,
  sample_key text unique,
  created_at timestamptz not null default now()
);

alter table public.candidate_profiles enable row level security;

create policy "Users can read their own profile"
  on public.candidate_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- A company's jobs, separate from the scraped `jobs` table.
create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text not null default '',
  location_raw text,
  work_mode public.work_mode,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index job_postings_company_id_idx on public.job_postings (company_id);

alter table public.job_postings enable row level security;

create policy "Companies can read their jobs"
  on public.job_postings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = job_postings.company_id and c.owner_id = (select auth.uid())
    )
  );

create policy "Companies can delete their jobs"
  on public.job_postings
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = job_postings.company_id and c.owner_id = (select auth.uid())
    )
  );

-- Applications to a company's jobs, separate from `applications`, the candidate-side tracker.
-- Deleting a job deletes its applications; the candidates stay. `candidate_id` points at the
-- profile, not at auth.users, so a query can join an application with its candidate.
create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_posting_id uuid not null references public.job_postings (id) on delete cascade,
  candidate_id uuid not null references public.candidate_profiles (user_id) on delete cascade,
  applied_at timestamptz not null default now(),
  unique (job_posting_id, candidate_id)
);

create index job_applications_candidate_id_idx on public.job_applications (candidate_id);

alter table public.job_applications enable row level security;

create policy "Companies can read applications to their jobs"
  on public.job_applications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_postings j
      join public.companies c on c.id = j.company_id
      where j.id = job_applications.job_posting_id and c.owner_id = (select auth.uid())
    )
  );

-- A company reads the profiles of the candidates who applied to its jobs, and only those. Permissive
-- policies are OR'd with "Users can read their own profile". The chain of policies has no cycle:
-- profiles -> applications -> jobs -> companies.
create policy "Companies can read the profiles of their applicants"
  on public.candidate_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_applications a
      join public.job_postings j on j.id = a.job_posting_id
      join public.companies c on c.id = j.company_id
      where a.candidate_id = candidate_profiles.user_id and c.owner_id = (select auth.uid())
    )
  );

-- RLS does not cover TRUNCATE, so drop every privilege except the ones granted below.
revoke all on public.candidate_profiles from anon, authenticated;
grant select on public.candidate_profiles to authenticated;

revoke all on public.job_postings from anon, authenticated;
grant select, delete on public.job_postings to authenticated;

revoke all on public.job_applications from anon, authenticated;
grant select on public.job_applications to authenticated;

-- Creates the caller's company if it has none, and, the first time, its demo job with one application
-- from each of three mock candidates. Called on every employer dashboard visit, so it is idempotent.
--
-- The company row is locked (`for update`), so two simultaneous first visits can't make two demo
-- jobs. If the mock candidates don't exist yet, it makes the company and leaves `demo_seeded_at`
-- null: the demo job appears on a later visit, once the seed script has run.
--
-- It is security definer because clients can't insert into any of these tables. The account type is
-- read from the JWT, where only the secret-key client can change it.
create or replace function public.ensure_employer_workspace()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_company_id uuid;
  v_seeded_at timestamptz;
  v_job_id uuid;
begin
  if v_user is null or (select auth.jwt() -> 'app_metadata' ->> 'account_type') is distinct from 'employer' then
    raise exception 'Only an employer account has a workspace' using errcode = '42501';
  end if;

  insert into public.companies (owner_id) values (v_user) on conflict (owner_id) do nothing;

  select id, demo_seeded_at into v_company_id, v_seeded_at
  from public.companies
  where owner_id = v_user
  for update;

  if v_seeded_at is null and (select count(*) from public.candidate_profiles where is_mock) >= 3 then
    insert into public.job_postings (company_id, title, description, location_raw, work_mode, is_demo)
    values (
      v_company_id,
      'Senior Product Designer',
      E'This is a sample job with fictional applicants, so you can try Callback before a real candidate applies. Delete it whenever you like.\n\n'
        || E'We are looking for a senior product designer to own the design of a tool that operations teams use all day: dense information that still has to feel fast. You will work close to engineering, run research, and keep a design system the whole team uses.',
      'Belgrade, Serbia',
      'HYBRID',
      true
    )
    returning id into v_job_id;

    insert into public.job_applications (job_posting_id, candidate_id)
    select v_job_id, p.user_id
    from public.candidate_profiles p
    where p.is_mock
    order by p.sample_key
    limit 3;

    update public.companies set demo_seeded_at = now() where id = v_company_id;
  end if;

  return v_company_id;
end;
$$;

-- Only a signed-in client may call it (it still refuses anyone who isn't an employer).
revoke execute on function public.ensure_employer_workspace() from public, anon;
grant execute on function public.ensure_employer_workspace() to authenticated;
