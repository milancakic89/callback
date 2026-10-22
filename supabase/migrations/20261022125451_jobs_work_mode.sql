-- Work mode for a posting, computed by the scraper at publish time (see scraper/stages/publish.ts).
-- Null means unknown: the scraper found no clear signal in the title, location or description.
create type public.work_mode as enum ('REMOTE', 'HYBRID', 'ON_SITE');

alter table public.jobs add column work_mode public.work_mode;
