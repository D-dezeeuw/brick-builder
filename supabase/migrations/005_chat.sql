-- ---------------------------------------------------------------------------
-- Room chat (persistent).
--
-- Scope: one immutable text message per row, tied to a room and the
-- authenticated caller. Realtime publishes INSERTs so everyone in the
-- room sees new messages without polling. Editing/deleting is out of
-- scope — no UPDATE/DELETE policies, no column for it.
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,
  author_name text not null default 'anon',
  body text not null check (length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists messages_room_time_idx
  on public.messages (room_id, created_at);

-- Realtime publication (wrapped in a DO so re-running is a no-op).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

alter table public.messages enable row level security;

-- Mirror the brick-access gate: either the room is public (no password)
-- or the caller is an authenticated member. Keeps password-protected
-- rooms' chat private along with their builds.
drop policy if exists "messages_read" on public.messages;
create policy "messages_read"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.rooms r
      where r.id = messages.room_id
      and (
        r.password_hash is null
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
  on public.messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and length(author_name) between 1 and 64
    and exists (
      select 1 from public.rooms r
      where r.id = messages.room_id
      and (
        r.password_hash is null
        or exists (
          select 1 from public.room_members rm
          where rm.room_id = r.id and rm.user_id = auth.uid()
        )
      )
    )
  );

notify pgrst, 'reload schema';
