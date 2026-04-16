-- ---------------------------------------------------------------------------
-- Phase 5 — real-time multiplayer schema
--
-- Run this once in the Supabase SQL editor (or `supabase db push` if you've
-- configured the Supabase CLI). It provisions two tables, enables Realtime
-- on both, and installs anon-accessible RLS policies so the publishable
-- key in apps/web/.env is sufficient for clients.
--
-- The security model is deliberately open: anyone with a room id can read
-- and edit it. Rooms are treated like unguessable shared documents. Swap
-- to auth-gated policies if you ever need stricter access.
-- ---------------------------------------------------------------------------

-- Rooms: one row per live creation. Holds the non-brick state
-- (title + the baseplate extent) so joining a room starts from a
-- coherent snapshot without replaying a full edit log.
create table if not exists public.rooms (
  id text primary key,
  title text not null default 'Untitled Creation',
  baseplate_bounds jsonb not null default jsonb_build_object(
    'minGx', -16, 'maxGx', 16,
    'minGz', -16, 'maxGz', 16
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bricks: one row per placed brick. Coordinates are integer grid cells
-- (gx, gy, gz) as defined in packages/shared/src/index.ts.
create table if not exists public.bricks (
  id text primary key,
  room_id text not null references public.rooms(id) on delete cascade,
  shape text not null,
  color text not null,
  gx integer not null,
  gy integer not null check (gy >= 0),
  gz integer not null,
  rotation smallint not null check (rotation between 0 and 3),
  created_at timestamptz not null default now()
);

create index if not exists bricks_room_idx on public.bricks (room_id);

-- Realtime: stream INSERT/UPDATE/DELETE for both tables to subscribed clients.
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.bricks;

-- Row-level security: open CRUD for anon. Rooms remain private-by-obscurity
-- (the id is the capability). Production deployments should bolt on auth.
alter table public.rooms  enable row level security;
alter table public.bricks enable row level security;

drop policy if exists "rooms_anon_all"  on public.rooms;
drop policy if exists "bricks_anon_all" on public.bricks;

create policy "rooms_anon_all"
  on public.rooms
  for all
  to anon
  using (true)
  with check (true);

create policy "bricks_anon_all"
  on public.bricks
  for all
  to anon
  using (true)
  with check (true);

-- updated_at trigger so rooms.updated_at tracks the last edit without the
-- client having to set it explicitly.
create or replace function public.touch_rooms_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_touch_updated_at on public.rooms;
create trigger rooms_touch_updated_at
  before update on public.rooms
  for each row execute function public.touch_rooms_updated_at();
