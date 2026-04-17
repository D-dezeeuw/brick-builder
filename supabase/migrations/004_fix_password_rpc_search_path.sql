-- ---------------------------------------------------------------------------
-- Phase 6 fix — password RPCs couldn't find pgcrypto.
--
-- Supabase installs pgcrypto into the `extensions` schema, not `public`,
-- so the RPCs from migration 002 failed at runtime with
--   "function gen_salt(unknown, integer) does not exist"  (SQLSTATE 42883)
-- the first time a user clicked "Set password". Fix: add `extensions` to
-- each RPC's search_path so the unqualified calls to `gen_salt(...)` and
-- `crypt(...)` resolve. Redefining the functions is idempotent via
-- `create or replace`; no data migration needed.
-- ---------------------------------------------------------------------------

create or replace function public.set_room_password(
  p_room_id text,
  p_new_password text,
  p_current_password text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  stored_hash text;
  caller uuid := auth.uid();
begin
  if caller is null then return false; end if;
  if p_new_password is null or length(p_new_password) < 1 or length(p_new_password) > 256 then
    return false;
  end if;

  select password_hash into stored_hash from public.rooms where id = p_room_id;
  if stored_hash is not null then
    if p_current_password is null or stored_hash <> crypt(p_current_password, stored_hash) then
      return false;
    end if;
  end if;

  update public.rooms
  set password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      password_set_at = now()
  where id = p_room_id;

  insert into public.room_members(room_id, user_id)
  values (p_room_id, caller)
  on conflict do nothing;

  delete from public.room_members
  where room_id = p_room_id and user_id <> caller;

  return true;
end;
$$;

create or replace function public.remove_room_password(
  p_room_id text,
  p_current_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  stored_hash text;
  caller uuid := auth.uid();
begin
  if caller is null then return false; end if;

  select password_hash into stored_hash from public.rooms where id = p_room_id;
  if stored_hash is null then return true; end if;
  if p_current_password is null or stored_hash <> crypt(p_current_password, stored_hash) then
    return false;
  end if;

  update public.rooms
  set password_hash = null,
      password_set_at = now()
  where id = p_room_id;

  delete from public.room_members where room_id = p_room_id;

  return true;
end;
$$;

create or replace function public.join_room(
  p_room_id text,
  p_password text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  stored_hash text;
  caller uuid := auth.uid();
begin
  if caller is null then return false; end if;

  select password_hash into stored_hash from public.rooms where id = p_room_id;
  if stored_hash is null then return true; end if;

  if p_password is null or stored_hash <> crypt(p_password, stored_hash) then
    return false;
  end if;

  insert into public.room_members(room_id, user_id)
  values (p_room_id, caller)
  on conflict do nothing;

  return true;
end;
$$;

-- Keep the execute grants in sync (create or replace preserves them, but
-- re-applying is a no-op and protects against earlier runs that may not
-- have granted them cleanly).
revoke all on function public.set_room_password(text, text, text) from public;
revoke all on function public.remove_room_password(text, text) from public;
revoke all on function public.join_room(text, text) from public;
grant execute on function public.set_room_password(text, text, text) to authenticated;
grant execute on function public.remove_room_password(text, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;

-- Nudge PostgREST to refresh its schema cache so the new definitions
-- are visible immediately instead of after the usual poll interval.
notify pgrst, 'reload schema';
