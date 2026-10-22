-- Scraped job postings, published from scraper/data/jobs.json (see scraper/stages/publish.ts).
-- Columns mirror the `Job` type in scraper/types.ts; `id` is "<source>:<externalId>".

create table if not exists public.jobs (
  id text primary key,
  company_joberty_id integer not null,
  company_name text not null,
  title text not null,
  location_raw text,
  -- ISO 3166-1 alpha-2, uppercase. The scraper only keeps Serbia ("RS") and remote postings.
  country text check (country ~ '^[A-Z]{2}$'),
  is_remote boolean not null,
  remote_scope text,
  department text,
  -- Scraped from third-party sites, so only http(s) links are accepted.
  url text check (url ~* '^https?://'),
  -- Plain text, HTML stripped. Render it as text, never as HTML.
  description text,
  source text not null,
  posted_at timestamptz,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  -- False once a successful scrape no longer lists the posting; rows are kept, not deleted.
  active boolean not null default true,
  -- Lowercased haystack for a single `ilike` search over title and company.
  search_text text generated always as (lower(title || ' ' || company_name)) stored
);

-- Serves the public list: active jobs, newest first, with `id` as a stable pagination tiebreaker.
create index if not exists jobs_active_first_seen_idx
  on public.jobs (first_seen_at desc, id)
  where active;

-- Anyone can read active jobs; with no write policies, only service_role (which bypasses RLS) can write.
alter table public.jobs enable row level security;

create policy "Active jobs are public"
  on public.jobs
  for select
  to anon, authenticated
  using (active);

-- RLS does not cover TRUNCATE, so drop every privilege except SELECT.
revoke all on public.jobs from anon, authenticated;
grant select on public.jobs to anon, authenticated;
