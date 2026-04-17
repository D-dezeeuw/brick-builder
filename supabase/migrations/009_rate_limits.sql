-- ---------------------------------------------------------------------------
-- Rate limits for brute-force and spam surfaces.
--
-- Two separate concerns bundled into one migration because they're both
-- small and touch orthogonal surfaces (join_room RPC vs chat insert
-- policy).
--
-- 1) join_room password-attempt floor
--    Without throttling, an attacker who has a room id can pipeline
--    thousands of `join_room(id, guess)` calls per second against a
--    password-protected room. Adding ~500ms + jitter of `pg_sleep`
--    before the hash compare drops that to ≤ 2 attempts/sec per
--    connection. Public rooms skip the sleep — there's nothing to
--    brute-force there.
--
-- 2) Chat message rate limit
--    Any member of a room can insert up to 10 messages in any rolling
--    10-second window. Above that the insert policy rejects the row
--    and the client falls back to its existing error path. The check
--    is a single indexed count — messages_room_time_idx covers it.
-- ---------------------------------------------------------------------------

-- 1) join_room ---------------------------------------------------------------

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

  -- Public rooms: no secret, no brute-force target, no sleep.
  if stored_hash is null then return true; end if;

  -- Password room: pay the floor regardless of password correctness so
  -- an attacker can't time responses or brute-force at line rate.
  perform pg_sleep(0.5 + random() * 0.2);

  if p_password is null or stored_hash <> crypt(p_password, stored_hash) then
    return false;
  end if;

  insert into public.room_members(room_id, user_id)
  values (p_room_id, caller)
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.join_room(text, text) from public;
grant execute on function public.join_room(text, text) to authenticated;

-- 2) messages rate limit ----------------------------------------------------

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert"
  on public.messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and length(author_name) between 1 and 64
    -- Rolling 10-second window: caller may not have > 9 messages
    -- already in this room in the last 10 seconds (so this insert
    -- would be the 10th — acceptable). Indexed on (room_id, created_at).
    and (
      select count(*) from public.messages m
      where m.room_id = messages.room_id
        and m.user_id = auth.uid()
        and m.created_at > now() - interval '10 seconds'
    ) < 10
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
