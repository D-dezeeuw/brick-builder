-- ---------------------------------------------------------------------------
-- Fix — admin_verify_password / admin_list_rooms were ambiguous.
--
-- `returns table (..., expires_at timestamptz)` declares OUT-style
-- variables named after each column. PL/pgSQL then can't tell whether a
-- bare `expires_at` reference in the body means the variable or the
-- underlying table column (`admin_sessions.expires_at`), and throws
--   SQLSTATE 42702  "column reference \"expires_at\" is ambiguous"
-- on the first call. Same risk for admin_list_rooms where `updated_at`
-- appears both in the RETURN TABLE and as a column in ORDER BY.
--
-- Fix: add `#variable_conflict use_column` to the affected functions.
-- That tells PL/pgSQL to resolve ambiguities to the column, which is
-- what every usage inside the bodies actually wants. Our internal
-- locals (new_token, new_expires, stored_hash, session_ok) have
-- distinct names, so the pragma doesn't change any intended binding.
-- ---------------------------------------------------------------------------

create or replace function public.admin_verify_password(p_password text)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
#variable_conflict use_column
declare
  stored_hash text;
  new_token text;
  new_expires timestamptz;
begin
  delete from public.admin_sessions where expires_at < now();

  perform pg_sleep(0.5 + random() * 0.2);

  if p_password is null or length(p_password) = 0 then
    return query select null::text, null::timestamptz;
    return;
  end if;

  select password_hash into stored_hash
  from public.admin_credentials
  where id = 1;

  if stored_hash is null then
    return query select null::text, null::timestamptz;
    return;
  end if;

  if stored_hash <> crypt(p_password, stored_hash) then
    return query select null::text, null::timestamptz;
    return;
  end if;

  new_token := encode(gen_random_bytes(32), 'base64');
  new_expires := now() + interval '1 hour';
  insert into public.admin_sessions (token, expires_at)
  values (new_token, new_expires);

  return query select new_token, new_expires;
end;
$$;

create or replace function public.admin_list_rooms(p_token text)
returns table (
  id text,
  title text,
  created_at timestamptz,
  updated_at timestamptz,
  brick_count bigint,
  has_password boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  session_ok boolean;
begin
  select true into session_ok
  from public.admin_sessions
  where token = p_token and expires_at > now()
  limit 1;
  if not coalesce(session_ok, false) then return; end if;

  return query
  select r.id,
         r.title,
         r.created_at,
         r.updated_at,
         coalesce(b.count, 0) as brick_count,
         (r.password_hash is not null) as has_password
  from public.rooms r
  left join (
    select room_id, count(*)::bigint as count
    from public.bricks
    group by room_id
  ) b on b.room_id = r.id
  order by r.updated_at desc;
end;
$$;

-- Re-assert grants (create or replace preserves them, belt-and-braces).
revoke all on function public.admin_verify_password(text) from public;
revoke all on function public.admin_list_rooms(text) from public;
grant execute on function public.admin_verify_password(text) to authenticated;
grant execute on function public.admin_list_rooms(text) to authenticated;

notify pgrst, 'reload schema';
