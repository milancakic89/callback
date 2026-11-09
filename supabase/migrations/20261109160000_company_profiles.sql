-- A company's profile (see features/company-profile.md): a description of the company and what it
-- does, and four facts (website, industry, size, headquarters). The employer writes it once on
-- /{slug}/profile; candidates read it on every posting of the company and on /companies/{slug}.
--
-- The name and the slug stay what `set_up_company()` made them. Only the five new columns can be
-- written by a client, and only by the company's owner.

create type public.company_size as enum ('1-10', '11-50', '51-200', '201-500', '501-1000', '1000+');

-- Every column is null or a trimmed, non-empty value within its limit (the same limits as
-- src/lib/companies/profile.ts; the form checks them first). The website is an http(s) address with
-- no whitespace: it ends up in an `href`, so no other scheme can be stored.
alter table public.companies
  add column description text,
  add column website text,
  add column industry text,
  add column size public.company_size,
  add column headquarters text,
  add constraint companies_description_valid check (
    description is null or (description = btrim(description) and char_length(description) between 1 and 5000)
  ),
  add constraint companies_website_valid check (
    website is null or (website ~* '^https?://[^[:space:]]+$' and char_length(website) <= 200)
  ),
  add constraint companies_industry_valid check (
    industry is null or (industry = btrim(industry) and char_length(industry) between 1 and 80)
  ),
  add constraint companies_headquarters_valid check (
    headquarters is null or (headquarters = btrim(headquarters) and char_length(headquarters) between 1 and 200)
  );

-- The owner writes the profile with their own session. `employer_jobs.sql` granted `select` only and
-- no policy for writing, so `name`, `slug`, `owner_id` and `demo_seeded_at` stay out of reach: a
-- column-level grant lists exactly the five columns, and the policy limits the rows to the caller's.
create policy "Owners can update their company profile" on public.companies
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant update (description, website, industry, size, headquarters) on public.companies to authenticated;

-- What a candidate, or a guest, may see of a company: the name, the slug and the profile, and
-- nothing else (no id, no owner). A company that has not been set up has no name or slug to show,
-- so it answers nothing. Security definer because `companies` can only be read by its owner.
create or replace function public.public_company_profile(p_slug text)
returns table (
  name text,
  slug text,
  description text,
  website text,
  industry text,
  size public.company_size,
  headquarters text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.slug, c.description, c.website, c.industry, c.size, c.headquarters
  from public.companies c
  where c.slug = p_slug
    and c.name is not null
    and c.slug is not null;
$$;

revoke execute on function public.public_company_profile(text) from public;
grant execute on function public.public_company_profile(text) to anon, authenticated;

-- The published jobs, now narrowed to one company's for its page. Postgres cannot add a parameter
-- with `create or replace`, so the function is dropped and made again with the same body and the
-- same grants. The code that is already deployed calls it with no arguments or with `p_job_id` only,
-- which still resolves to the new function, so this can go before the code does.
drop function public.published_job_postings(uuid);

create function public.published_job_postings(p_job_id uuid default null, p_company_slug text default null)
returns table (
  id uuid,
  title text,
  description text,
  location_raw text,
  work_mode public.work_mode,
  published_at timestamptz,
  company_name text,
  company_slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.title, j.description, j.location_raw, j.work_mode, j.published_at, c.name, c.slug
  from public.job_postings j
  join public.companies c on c.id = j.company_id
  where j.published_at is not null
    and not j.is_demo
    and c.name is not null
    and c.slug is not null
    and (p_job_id is null or j.id = p_job_id)
    and (p_company_slug is null or c.slug = p_company_slug)
  order by j.published_at desc, j.id;
$$;

revoke execute on function public.published_job_postings(uuid, text) from public;
grant execute on function public.published_job_postings(uuid, text) to anon, authenticated;
