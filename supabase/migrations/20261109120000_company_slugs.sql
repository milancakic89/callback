-- A company's name and its address, /{slug} (see features/company-slugs.md).
--
-- Both are chosen once, on /setup, after the employer's first visit: set_up_company() below is the
-- only way to write them. Clients have no update privilege on `companies` (employer_jobs.sql), so a
-- slug can't be changed afterwards either. The three companies that exist have neither yet, so
-- both columns allow null and those employers go through /setup on their next visit.

-- What a slug may be: 3 to 40 characters, a-z, 0-9 and "-", no hyphen at either end, and not a word
-- the app itself uses at the top level of its URLs. The list is in src/lib/companies/company.ts too
-- (RESERVED_SLUGS), and company.test.ts checks that this migration has every word of it, and that
-- every route in src/app is on it. A word added there needs a new migration that replaces this
-- function.
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
      'help', 'home', 'jobs', 'login', 'logout', 'new', 'pricing', 'privacy', 'profile', 'public',
      'reset-password', 'review', 'robots', 'saved', 'saved-jobs', 'search', 'settings', 'setup',
      'sign-in', 'sign-out', 'sign-up', 'signin', 'signup', 'sitemap', 'static', 'status',
      'support', 'terms', 'test', 'www'
    ]);
$$;

revoke execute on function public.company_slug_valid(text) from public, anon, authenticated;

alter table public.companies
  add column slug text unique,
  add constraint companies_slug_valid check (slug is null or public.company_slug_valid(slug)),
  add constraint companies_name_valid check (
    name is null or (name = btrim(name) and char_length(name) between 1 and 100)
  );

-- Gives the caller's company its name and its slug, once. Makes the company (and its demo job) first
-- if the employer comes here before their first dashboard visit, through ensure_employer_workspace().
--
-- Security definer because clients can't update `companies`. The account type is read from the JWT,
-- where only the secret-key client can change it, as in ensure_employer_workspace(). The errors are
-- the ones the Server Action maps to a message:
--   42501  not an employer account
--   22023  the name is empty or over 100 characters
--   23514  the slug is badly formed or reserved
--   55000  this company already has a slug (it is fixed once saved)
--   23505  another company has the slug
create or replace function public.set_up_company(p_name text, p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_company_id uuid;
  v_slug text;
begin
  if (select auth.uid()) is null or (select auth.jwt() -> 'app_metadata' ->> 'account_type') is distinct from 'employer' then
    raise exception 'Only an employer account has a company' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 100 then
    raise exception 'The company name must be 1 to 100 characters' using errcode = '22023';
  end if;
  if not coalesce(public.company_slug_valid(p_slug), false) then
    raise exception 'That address is not allowed' using errcode = '23514';
  end if;

  v_company_id := public.ensure_employer_workspace();

  select slug into v_slug from public.companies where id = v_company_id for update;
  if v_slug is not null then
    raise exception 'This company already has an address' using errcode = '55000';
  end if;

  -- A slug another company has is a unique violation (23505) here.
  update public.companies set name = v_name, slug = p_slug where id = v_company_id;
end;
$$;

revoke execute on function public.set_up_company(text, text) from public, anon;
grant execute on function public.set_up_company(text, text) to authenticated;
