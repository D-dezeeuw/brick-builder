-- ---------------------------------------------------------------------------
-- Admin panel — password-gated room management.
--
-- Provides a single-admin credential store (bcrypt-hashed, never in code)
-- plus server-side session tokens so the admin UI can list / delete rooms
-- without re-sending the password on every request.
--
-- SETUP AFTER MIGRATION — one-time, owner-only:
--   Open the Supabase SQL editor (service_role session, private to the
--   project owner) and run:
--
--     insert into public.admin_credentials (id, password_hash)
--     values (1, extensions.crypt('your-strong-admin-password',
--                                 extensions.gen_salt('bf', 12)));
--
--   The plaintext never leaves the SQL editor. The stored hash is what
--   future `admin_verify_password` calls compare against. Rotation can
--   be done later from the admin UI via `admin_rotate_password`.
--
-- Threat model:
--   * Brute force — countered by a minimum password length enforced on
--     rotation (>= 12 chars) and an unconditional ~500ms sleep inside
--     the verify RPC so throughput is ≤ 2 attempts/sec per connection.
--     Owners should pick a password with real entropy (e.g. 16+ chars
--     mixed).
--   * Direct table access — RLS is enabled with ZERO policies on both
--     new tables, so no client role can read / write directly. All
--     operations flow through SECURITY DEFINER functions.
--   * Session theft — tokens are 32 random bytes stored with an
--     expires_at; clients keep them in sessionStorage (gone when the
--     tab closes). `admin_rotate_password` invalidates every session,
--     so a compromised token's blast radius ends on the next rotation.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- 1) Schema -----------------------------------------------------------------

create table if not exists public.admin_credentials (
  id int primary key default 1,
  password_hash text not null,
  set_at timestamptz not null default now(),
  -- Enforce singleton. A second row would be meaningless here.
  constraint admin_credentials_singleton check (id = 1)
);

create table if not exists public.admin_sessions (
  token text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_sessions_expires_idx
  on public.admin_sessions (expires_at);

-- 2) Lock the tables down ---------------------------------------------------
-- RLS on, NO policies. Only SECURITY DEFINER RPCs below can touch these.

alter table public.admin_credentials enable row level security;
alter table public.admin_sessions enable row level security;

-- Belt-and-braces: revoke table-level privileges from every role. Even a
-- misconfigured policy shouldn't matter, but remove the ammo anyway.
revoke all on public.admin_credentials from public;
revoke all on public.admin_credentials from anon;
revoke all on public.admin_credentials from authenticated;
revoke all on public.admin_sessions from public;
revoke all on public.admin_sessions from anon;
revoke all on public.admin_sessions from authenticated;

-- 3) RPCs -------------------------------------------------------------------

-- Verify the admin password. On success returns a session token + expiry;
-- on failure returns nulls. Sleeps ~500ms regardless of outcome so attackers
-- can't time responses or brute force at rate.
create or replace function public.admin_verify_password(p_password text)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  stored_hash text;
  new_token text;
  new_expires timestamptz;
begin
  -- Opportunistic expired-session cleanup. Bounded work: one DELETE on an
  -- indexed column. Keeps the session table from growing unbounded.
  delete from public.admin_sessions where expires_at < now();

  -- Constant-ish floor. A bit of jitter so the floor isn't an obvious signal.
  perform pg_sleep(0.5 + random() * 0.2);

  if p_password is null or length(p_password) = 0 then
    return query select null::text, null::timestamptz;
    return;
  end if;

  select password_hash into stored_hash
  from public.admin_credentials
  where id = 1;

  if stored_hash is null then
    -- No admin configured yet. Refuse rather than leak the fact.
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

-- Returns true iff the token exists and hasn't expired. Used by the UI to
-- decide whether to show the login form or the panel on mount.
create or replace function public.admin_check_session(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ok boolean;
begin
  if p_token is null or length(p_token) = 0 then return false; end if;
  select true into ok
  from public.admin_sessions
  where token = p_token and expires_at > now()
  limit 1;
  return coalesce(ok, false);
end;
$$;

-- Explicit logout. Deletes the caller's session row.
create or replace function public.admin_end_session(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token is null then return false; end if;
  delete from public.admin_sessions where token = p_token;
  return true;
end;
$$;

-- Rotate the admin password. Requires a valid session AND the current
-- password. Succeeds → every session is invalidated; the caller has to
-- re-auth with the new password.
create or replace function public.admin_rotate_password(
  p_token text,
  p_old_password text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  stored_hash text;
  session_ok boolean;
begin
  select true into session_ok
  from public.admin_sessions
  where token = p_token and expires_at > now()
  limit 1;
  if not coalesce(session_ok, false) then return false; end if;

  if p_new_password is null
     or length(p_new_password) < 12
     or length(p_new_password) > 256 then
    return false;
  end if;

  select password_hash into stored_hash
  from public.admin_credentials where id = 1;
  if stored_hash is null then return false; end if;

  if p_old_password is null or stored_hash <> crypt(p_old_password, stored_hash) then
    return false;
  end if;

  update public.admin_credentials
  set password_hash = crypt(p_new_password, gen_salt('bf', 12)),
      set_at = now()
  where id = 1;

  -- Nuke every session so the new password must be supplied going forward.
  delete from public.admin_sessions;

  return true;
end;
$$;

-- List every room with a few computed fields useful to the admin view.
-- Returns an empty set if the session is invalid so the shape stays
-- predictable on the client.
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

-- Delete a room and everything under it (bricks cascade via FK; memberships
-- cascade via FK). Returns true if the room existed and was removed.
create or replace function public.admin_delete_room(
  p_token text,
  p_room_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  session_ok boolean;
  affected int;
begin
  select true into session_ok
  from public.admin_sessions
  where token = p_token and expires_at > now()
  limit 1;
  if not coalesce(session_ok, false) then return false; end if;

  delete from public.rooms where id = p_room_id;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

-- 4) Execute grants ---------------------------------------------------------
-- All functions are SECURITY DEFINER so they run with the owner's rights.
-- Grant EXECUTE to `authenticated` — the web client signs in anonymously
-- before any RPC, so every admin-panel request is from `authenticated`.
-- `anon` gets nothing so a raw anon key can't hit these endpoints.

revoke all on function public.admin_verify_password(text) from public;
revoke all on function public.admin_check_session(text) from public;
revoke all on function public.admin_end_session(text) from public;
revoke all on function public.admin_rotate_password(text, text, text) from public;
revoke all on function public.admin_list_rooms(text) from public;
revoke all on function public.admin_delete_room(text, text) from public;

grant execute on function public.admin_verify_password(text) to authenticated;
grant execute on function public.admin_check_session(text) to authenticated;
grant execute on function public.admin_end_session(text) to authenticated;
grant execute on function public.admin_rotate_password(text, text, text) to authenticated;
grant execute on function public.admin_list_rooms(text) to authenticated;
grant execute on function public.admin_delete_room(text, text) to authenticated;

-- Kick PostgREST's schema cache so the new RPCs are callable immediately.
notify pgrst, 'reload schema';
