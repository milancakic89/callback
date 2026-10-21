-- Fixed-window rate-limit counters for auth Server Actions (see src/lib/supabase/rate-limit-store.ts).

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);

-- RLS on with no policies: only service_role (which bypasses RLS) can touch rows.
alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(p_key text, p_window_ms integer)
returns table (count integer, reset_at timestamptz)
language sql
security invoker
set search_path = ''
as $$
  insert into public.rate_limits as rl (key, count, reset_at)
  values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update set
    count = case when rl.reset_at <= now() then 1 else rl.count + 1 end,
    reset_at = case
      when rl.reset_at <= now() then now() + make_interval(secs => p_window_ms / 1000.0)
      else rl.reset_at
    end
  returning rl.count, rl.reset_at;
$$;

-- Clients must not be able to call it and burn someone else's limit.
revoke execute on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;
