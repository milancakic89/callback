-- Applications to jobs on LinkedIn, HelloWorld and Infostud, added from the browser extension
-- (see features/chrome-extension.md).
--
-- `public.applications` needs a `public.jobs` row, and only the scraper (the secret key) writes one, so a
-- job the candidate found elsewhere has nowhere to live. These are the candidate's own rows: written and
-- read with their own session, under RLS, and shown on /applications beside the others, with the same
-- status. The candidate's JWT can reach PostgREST directly, so the rules of the page that adds a row
-- (src/lib/external-jobs/) are enforced here too: the source, the shape of the address per source, the
-- lengths, a CV that is the candidate's own, and a limit per user.
--
-- Needs Postgres 15 or newer: `on delete set null (cv_id)` below takes a column list from that version.

-- The CV the row names has to be the candidate's own. A foreign key to (id, user_id) says so without
-- a trigger: this row's own `user_id` is what the CV's must equal.
alter table public.candidate_cvs
  add constraint candidate_cvs_id_user_key unique (id, user_id);

create table public.external_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null check (source in ('linkedin', 'helloworld', 'infostud')),
  -- The job's canonical address on its site (canonicalJobUrl): https, the site's own host, no query,
  -- no hash. Each pattern is the one in CANONICAL_URL_PATTERNS, and a test keeps the two the same.
  url text not null,
  title text not null check (char_length(title) between 1 and 200),
  company_name text not null check (char_length(company_name) between 1 and 200),
  location text check (char_length(location) between 1 and 200),
  -- Null when the candidate chose no CV, and once the CV is deleted: the row stays. Only `cv_id` is
  -- cleared, never `user_id`.
  cv_id uuid,
  status public.application_status not null default 'PENDING',
  applied_at timestamptz not null default now(),
  constraint external_applications_url_shape check (
    char_length(url) <= 500
    and url !~ '[[:cntrl:][:space:]]'
    and (
      (source = 'linkedin' and url ~ '^https://www\.linkedin\.com/jobs/view/[0-9]{5,20}/$')
      or (source = 'helloworld' and url ~ '^https://www\.helloworld\.rs/posao/[^/?#]+/[^/?#]+/[0-9]{1,12}$')
      or (source = 'infostud' and url ~ '^https://poslovi\.infostud\.com/posao/[^/?#]+/[^/?#]+/[0-9]{1,12}$')
    )
  ),
  constraint external_applications_user_url_key unique (user_id, url),
  constraint external_applications_cv_fkey
    foreign key (cv_id, user_id) references public.candidate_cvs (id, user_id) on delete set null (cv_id)
);

-- The foreign key above looks a CV's rows up by (cv_id, user_id) when a CV is deleted.
create index external_applications_cv_id_idx on public.external_applications (cv_id);

alter table public.external_applications enable row level security;

create policy "Users can read their own external applications"
  on public.external_applications
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can add their own external applications"
  on public.external_applications
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can update the status of their own external applications"
  on public.external_applications
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can remove their own external applications"
  on public.external_applications
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- RLS does not cover TRUNCATE, so drop every privilege and grant back only what is used. `user_id` is
-- never written by a client (its default is the caller), `applied_at` is the moment of the insert, and
-- status is the only column that changes afterwards.
revoke all on public.external_applications from anon, authenticated;
grant select on public.external_applications to authenticated;
grant insert (source, url, title, company_name, location, cv_id, status) on public.external_applications to authenticated;
grant update (status) on public.external_applications to authenticated;
grant delete on public.external_applications to authenticated;

-- At most 1,000 rows a candidate. The lock on the user makes two inserts at once wait for each other,
-- so both can't see 999 and become the 1,000th and the 1,001st. The Server Action answers 54000 with a
-- friendly message (as candidate_cvs_limit does for CVs).
create or replace function public.external_applications_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('external_applications:' || new.user_id::text, 0));
  if (select count(*) from public.external_applications where user_id = new.user_id) >= 1000 then
    raise exception 'A candidate keeps at most 1000 external applications' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke execute on function public.external_applications_limit() from public, anon, authenticated;

create trigger external_applications_limit
  before insert on public.external_applications
  for each row execute function public.external_applications_limit();
