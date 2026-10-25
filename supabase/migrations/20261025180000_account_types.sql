-- Account types (features/account-types.md): every user is a candidate (looks for work) or an
-- employer (posts jobs). The type lives in app_metadata.account_type: it rides in the JWT, so proxy
-- can route on it without a query, and only the secret-key client can change it.

-- Accounts created before account types existed all used the job-seeker side.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"account_type": "candidate"}'::jsonb
where raw_app_meta_data ->> 'account_type' is null;

-- Sign-in for an unconfirmed account has to know whether a type was already chosen (show the
-- choice dialog, or "confirm your email first"). The admin API can't look a user up by email, so
-- this does, for the secret-key client only. Auth stores emails lowercased.
create or replace function public.account_for_email(p_email text)
returns table (id uuid, account_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.raw_app_meta_data ->> 'account_type'
  from auth.users u
  where u.email = lower(p_email)
  limit 1;
$$;

-- Clients must not be able to probe which emails have accounts.
revoke execute on function public.account_for_email(text) from public, anon, authenticated;
grant execute on function public.account_for_email(text) to service_role;
