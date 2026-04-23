-- ---------------------------------------------------------------------------
-- REPLICA IDENTITY FULL on bricks so DELETE events propagate over realtime.
--
-- Symptom: in a multi-user room, brick placements and edits synced fine but
-- erasures by other users never disappeared from your screen.
--
-- Root cause: the client's postgres_changes subscription filters on
-- `room_id=eq.<roomId>`, but Postgres' default REPLICA IDENTITY only sends
-- the primary key columns in DELETE event payloads. `room_id` isn't in the
-- key (the `bricks.id` UUID is), so the server-side filter rejected every
-- DELETE event for the room. INSERT/UPDATE worked because their payloads
-- always include the full new row.
--
-- REPLICA IDENTITY FULL makes Postgres emit the full old row on DELETE, so
-- `room_id` is present and the filter matches. Write cost is a small WAL
-- bump per delete (a ~100-byte row instead of a 16-byte UUID) — entirely
-- acceptable for our write volume.
-- ---------------------------------------------------------------------------

alter table public.bricks replica identity full;
