-- CV filters on a job (see features/job-filters.md): short criteria an employer types as chips, which
-- uploaded CVs will later be checked against. This only stores them; nothing reads them yet.
--
-- Two text[] columns on job_postings, written and read together with the job from one form, so they
-- go through the same insert and update (and the same policies) as the other columns. They are
-- private to the company: a candidate-facing read of job_postings must leave them out.
--
-- Existing rows (the demo job) get empty lists.

alter table public.job_postings
  add column required_filters text[] not null default '{}',
  add column optional_filters text[] not null default '{}';

-- The limits of src/lib/companies/job-posting.ts, so the database doesn't rely on the app: the lists
-- are one-dimensional (or empty), hold at most 20 filters in all, and every filter is 1 to 100
-- characters, trimmed, not null, and unique case-insensitively across both lists.
create or replace function public.job_filters_valid(p_required text[], p_optional text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_required is not null
    and p_optional is not null
    and coalesce(array_ndims(p_required), 1) = 1
    and coalesce(array_ndims(p_optional), 1) = 1
    and (
      select count(*) <= 20
        and coalesce(bool_and(f is not null and f = btrim(f) and char_length(f) between 1 and 100), true)
        and count(distinct lower(f)) = count(*)
      from (select unnest(p_required) union all select unnest(p_optional)) as t(f)
    );
$$;

-- Check constraints run the function as the inserting role, so signed-in clients need to run it.
revoke execute on function public.job_filters_valid(text[], text[]) from public, anon;
grant execute on function public.job_filters_valid(text[], text[]) to authenticated;

alter table public.job_postings
  add constraint job_postings_filters_valid check (public.job_filters_valid(required_filters, optional_filters));

-- Column grants add to the existing ones (job_postings_insert.sql, job_publishing.sql).
grant insert (required_filters, optional_filters), update (required_filters, optional_filters)
  on public.job_postings to authenticated;
