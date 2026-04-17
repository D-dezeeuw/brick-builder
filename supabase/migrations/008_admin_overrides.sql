-- ---------------------------------------------------------------------------
-- Admin room overrides — observe + take over without knowing the password.
--
-- Two RPCs. Both require a valid admin session (same one minted by
-- admin_verify_password in migration 006).
--
-- 1) admin_join_room(token, room_id)
--    Grants the caller membership of `room_id` regardless of the room's
--    password. The caller is still the anonymous Supabase user behind the
--    admin panel, so subsequent RLS-gated reads/writes on that room pass
--    normally. Used by the admin panel's Observe + Take over buttons
--    before navigating to the room.
--
-- 2) admin_list_bricks(token, room_id)
--    Returns every brick in a room, bypassing the password-membership RLS
--    gate. Used for thumbnail generation in the admin list — we need the
--    brick data to render a preview, but we don't want to force a
--    membership side-effect for every room the admin scrolls past.
--
-- Both are SECURITY DEFINER with a pinned search_path and granted to
-- `authenticated`. Callers that don't present a valid admin session get
-- an empty result / `false` — the functions never leak data.
-- ---------------------------------------------------------------------------

create or replace function public.admin_join_room(
  p_token text,
  p_room_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  session_ok boolean;
  room_exists boolean;
  caller uuid := auth.uid();
begin
  if caller is null then return false; end if;

  select true into session_ok
  from public.admin_sessions
  where token = p_token and expires_at > now()
  limit 1;
  if not coalesce(session_ok, false) then return false; end if;

  select true into room_exists
  from public.rooms
  where id = p_room_id
  limit 1;
  if not coalesce(room_exists, false) then return false; end if;

  insert into public.room_members (room_id, user_id)
  values (p_room_id, caller)
  on conflict do nothing;

  return true;
end;
$$;

create or replace function public.admin_list_bricks(
  p_token text,
  p_room_id text
)
returns table (
  id text,
  room_id text,
  shape text,
  color text,
  gx integer,
  gy integer,
  gz integer,
  rotation smallint,
  transparent boolean,
  created_at timestamptz
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
  select b.id,
         b.room_id,
         b.shape,
         b.color,
         b.gx,
         b.gy,
         b.gz,
         b.rotation,
         b.transparent,
         b.created_at
  from public.bricks b
  where b.room_id = p_room_id
  order by b.created_at asc;
end;
$$;

revoke all on function public.admin_join_room(text, text) from public;
revoke all on function public.admin_list_bricks(text, text) from public;
grant execute on function public.admin_join_room(text, text) to authenticated;
grant execute on function public.admin_list_bricks(text, text) to authenticated;

notify pgrst, 'reload schema';
