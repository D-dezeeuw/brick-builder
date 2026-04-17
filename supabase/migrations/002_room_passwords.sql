-- ---------------------------------------------------------------------------
-- Phase 6 — optional room passwords
--
-- MANUAL STEP BEFORE RUNNING:
--   In the Supabase dashboard, enable Anonymous Sign-Ins under
--   Authentication → Providers (or Authentication → Settings depending on
--   your dashboard version). This migration switches policies from the
--   `anon` role to `authenticated`; clients sign in anonymously on load so
--   every request carries a JWT with auth.uid().
--
-- What this migration does:
--   * Adds password_hash + password_set_at to rooms.
--   * Adds a room_members table (user_id, room_id) — caller becomes a member
--     after supplying the right password.
--   * Replaces the wide-open anon RLS policies with membership-gated ones.
--     Rooms with NO password stay public (any authenticated user can read +
--     write); rooms WITH a password require membership.
--   * Adds SECURITY DEFINER RPCs: set_room_password / remove_room_password /
--     join_room. Passwords are bcrypt-hashed via pgcrypto; plaintext never
--     lands on disk.
-- ---------------------------------------------------------------------------

-- pgcrypto gives us bcrypt for password hashing. `if not exists` keeps this
-- migration idempotent if the extension is already enabled.
create extension if not exists pgcrypto;

-- 1) Schema additions -------------------------------------------------------

alter table public.rooms
  add column if not exists password_hash text;

-- Bumped every time a password is set / changed / removed. Clients diff this
-- against the value they joined under; a change = kick, re-prompt.
alter table public.rooms
  add column if not exists password_set_at timestamptz;

create table if not exists public.room_members (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_members_user_idx on public.room_members (user_id);
create index if not exists room_members_room_idx on public.room_members (room_id);

alter table public.room_members enable row level security;

-- Realtime on rooms is already enabled by migration 001; realtime on
-- room_members lets a client see when they've been removed (set-password
-- kick flow).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
end $$;

-- 2) RLS policies -----------------------------------------------------------
-- Drop the legacy anon-wide-open policies and install membership-gated ones.

drop policy if exists "rooms_anon_all"  on public.rooms;
drop policy if exists "bricks_anon_all" on public.bricks;

-- rooms: every authenticated user can read metadata (needed to show the
-- password prompt), create a room, and edit their own rooms or rooms that
-- have no password.
create policy "rooms_read_all"
  on public.rooms
  for select
  to authenticated
  using (true);

create policy "rooms_insert_any"
  on public.rooms
  for insert
  to authenticated
  with check (true);

create policy "rooms_update_member"
  on public.rooms
  for update
  to authenticated
  using (
    password_hash is null
    or exists (
      select 1 from public.room_members rm
      where rm.room_id = rooms.id and rm.user_id = auth.uid()
    )
  )
  with check (
    password_hash is null
    or exists (
      select 1 from public.room_members rm
      where rm.room_id = rooms.id and rm.user_id = auth.uid()
    )
  );

create policy "rooms_delete_member"
  on public.rooms
  for delete
  to authenticated
  using (
    password_hash is null
    or exists (
      select 1 from public.room_members rm
      where rm.room_id = rooms.id and rm.user_id = auth.uid()
    )
  );

-- bricks: same gate, applied uniformly to all CRUD ops. The subquery reads
-- the owning room's password_hash; null = open room, non-null = require
-- membership.
create policy "bricks_member_read"
  on public.bricks
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = bricks.room_id
      and (
        r.password_hash is null
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = auth.uid()
        )
      )
    )
  );

create policy "bricks_member_write"
  on public.bricks
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.rooms r
      where r.id = bricks.room_id
      and (
        r.password_hash is null
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = auth.uid()
        )
      )
    )
  );

create policy "bricks_member_update"
  on public.bricks
  for update
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = bricks.room_id
      and (
        r.password_hash is null
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = auth.uid()
        )
      )
    )
  )
  with check (
    exists (
      select 1 from public.rooms r
      where r.id = bricks.room_id
      and (
        r.password_hash is null
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = auth.uid()
        )
      )
    )
  );

create policy "bricks_member_delete"
  on public.bricks
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = bricks.room_id
      and (
        r.password_hash is null
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = auth.uid()
        )
      )
    )
  );

-- room_members: callers can see their own memberships only. INSERT/DELETE
-- happens exclusively through the SECURITY DEFINER RPCs below (no direct
-- write policy), so clients can't grant themselves access.
create policy "room_members_self_read"
  on public.room_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- 3) RPCs -------------------------------------------------------------------
-- All three are SECURITY DEFINER so they can write room_members regardless
-- of the caller's row-level permissions. Each one pins search_path to avoid
-- the classic "attacker injects a function via the search path" pitfall.

-- Set or change a password. If the room already has one, current_password
-- must match. The caller becomes a member and every other member is kicked.
create or replace function public.set_room_password(
  p_room_id text,
  p_new_password text,
  p_current_password text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
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

  -- Caller keeps access; everyone else is kicked.
  insert into public.room_members(room_id, user_id)
  values (p_room_id, caller)
  on conflict do nothing;

  delete from public.room_members
  where room_id = p_room_id and user_id <> caller;

  return true;
end;
$$;

-- Clear a password. Requires current_password to prove ownership. Once
-- cleared, memberships are no longer needed (anyone authenticated can
-- access), so we drop them to keep the table lean.
create or replace function public.remove_room_password(
  p_room_id text,
  p_current_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
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

-- Join a room. Public rooms return true without writing anything (no member
-- record needed). Password-protected rooms require the right password; on
-- success the caller is added to room_members so subsequent RLS checks pass.
create or replace function public.join_room(
  p_room_id text,
  p_password text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
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

-- Lock down RPC execution to authenticated users only. `public.*` functions
-- default to EXECUTE for PUBLIC otherwise, which includes anon.
revoke all on function public.set_room_password(text, text, text) from public;
revoke all on function public.remove_room_password(text, text) from public;
revoke all on function public.join_room(text, text) from public;
grant execute on function public.set_room_password(text, text, text) to authenticated;
grant execute on function public.remove_room_password(text, text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
