-- Job-board postings (scraper/stages/boards.ts: Himalayas, Jobicy, RemoteOK, Remotive, Arbeitnow)
-- have no Joberty company, so `company_joberty_id` is null for them. See features/job-boards.md.
alter table public.jobs alter column company_joberty_id drop not null;
