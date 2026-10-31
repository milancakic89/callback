-- Reviewing a job's applicants (features/applicant-review.md): the CV and cover letter of each
-- application, side by side, with a screening overview against the job's filters.
--
-- The documents live in a private Storage bucket that no client role can read. The app opens them
-- through /api/applications/{id}/documents/{kind}, which checks the application with the caller's
-- own client (so the policies below decide) and only then reads the file with the secret key. A
-- withdrawn application is never opened.
--
-- The demo job gets filters, and its three applications get their documents and the filters each
-- candidate's CV meets, written by hand: real matching comes later, and until then a real
-- application's `matched_filters` is null ("not checked yet").

alter table public.job_applications
  -- Object paths in the `application-documents` bucket. Null when the application has none.
  add column cv_path text,
  add column cover_letter_path text,
  -- The job's filters this application's CV meets; null until it has been checked. Only the secret
  -- key and the RPCs below write it.
  add column matched_filters text[],
  -- The company's own review marks: when the application was last marked viewed (Next), and liked.
  add column viewed_at timestamptz,
  add column liked_at timestamptz;

-- A company marks the applications to its own jobs as viewed or liked, and nothing else: the column
-- grant leaves out every other column. A withdrawn application can't be changed.
create policy "Companies can update applications to their jobs"
  on public.job_applications
  for update
  to authenticated
  using (
    withdrawn_at is null
    and exists (
      select 1
      from public.job_postings j
      join public.companies c on c.id = j.company_id
      where j.id = job_applications.job_posting_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    withdrawn_at is null
    and exists (
      select 1
      from public.job_postings j
      join public.companies c on c.id = j.company_id
      where j.id = job_applications.job_posting_id and c.owner_id = (select auth.uid())
    )
  );

grant update (viewed_at, liked_at) on public.job_applications to authenticated;

-- Private, PDF only, 5 MB a file. No policies on storage.objects for it, so only the secret key reads
-- or writes it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-documents', 'application-documents', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- The demo job's filters, and what each mock candidate's CV meets of them (read off the documents in
-- src/components/landing/sample-documents.tsx). Plain data for ensure_employer_workspace() and the
-- backfill below; no client calls these. The documents are uploaded by `npm run seed:mock-candidates`;
-- Priya Raman's demo application has no cover letter, so the review shows that case too.
create or replace function public.demo_job_filters(out required text[], out optional text[])
language sql
immutable
set search_path = ''
as $$
  select
    array['Figma', 'Design systems', '5+ years experience', 'English'],
    array['Accessibility', 'Prototyping in code', 'Mentoring'];
$$;

create or replace function public.demo_applicants()
returns table (sample_key text, cv_path text, cover_letter_path text, matched_filters text[])
language sql
immutable
set search_path = ''
as $$
  values
    ('ana-novak', 'mock/ana-novak/cv.pdf', 'mock/ana-novak/cover-letter.pdf',
      array['Figma', 'Design systems', '5+ years experience', 'English', 'Mentoring']),
    ('jonas-weber', 'mock/jonas-weber/cv.pdf', 'mock/jonas-weber/cover-letter.pdf',
      array['Design systems', '5+ years experience', 'English', 'Accessibility']),
    ('priya-raman', 'mock/priya-raman/cv.pdf', null,
      array['Design systems', '5+ years experience', 'Prototyping in code']);
$$;

revoke execute on function public.demo_job_filters() from public, anon, authenticated;
revoke execute on function public.demo_applicants() from public, anon, authenticated;

-- As in 20261026210000_employer_jobs.sql, plus the demo job's filters and its applications' documents
-- and matches. Same signature, so the deployed code keeps working before and after.
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
    insert into public.job_postings (
      company_id, title, description, location_raw, work_mode, is_demo, required_filters, optional_filters
    )
    select
      v_company_id,
      'Senior Product Designer',
      E'This is a sample job with fictional applicants, so you can try Callback before a real candidate applies. Delete it whenever you like.\n\n'
        || E'We are looking for a senior product designer to own the design of a tool that operations teams use all day: dense information that still has to feel fast. You will work close to engineering, run research, and keep a design system the whole team uses.',
      'Belgrade, Serbia',
      'HYBRID',
      true,
      f.required,
      f.optional
    from public.demo_job_filters() f
    returning id into v_job_id;

    insert into public.job_applications (job_posting_id, candidate_id, cv_path, cover_letter_path, matched_filters)
    select v_job_id, p.user_id, d.cv_path, d.cover_letter_path, d.matched_filters
    from public.candidate_profiles p
    join public.demo_applicants() d on d.sample_key = p.sample_key
    where p.is_mock;

    update public.companies set demo_seeded_at = now() where id = v_company_id;
  end if;

  return v_company_id;
end;
$$;

revoke execute on function public.ensure_employer_workspace() from public, anon;
grant execute on function public.ensure_employer_workspace() to authenticated;

-- Demo jobs made before this migration: the same filters, documents and matches.
update public.job_postings j
set required_filters = f.required, optional_filters = f.optional
from public.demo_job_filters() f
where j.is_demo;

update public.job_applications a
set cv_path = d.cv_path, cover_letter_path = d.cover_letter_path, matched_filters = d.matched_filters
from public.job_postings j, public.candidate_profiles p, public.demo_applicants() d
where j.id = a.job_posting_id
  and j.is_demo
  and p.user_id = a.candidate_id
  and p.is_mock
  and d.sample_key = p.sample_key;
