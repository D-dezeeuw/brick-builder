-- ---------------------------------------------------------------------------
-- Phase 6 tweak — clear-plastic ("transparent") brick modifier.
--
-- Adds a boolean to the bricks table so room sync can preserve whether
-- a brick is the transmissive glass variant. Defaulted to false so
-- every existing row stays solid and nothing in the RLS policy layer
-- needs to change.
-- ---------------------------------------------------------------------------

alter table public.bricks
  add column if not exists transparent boolean not null default false;

-- Nudge PostgREST to refresh its schema cache immediately so the new
-- column is visible to the REST API. Without this the client hits
-- PGRST204 "Could not find the 'transparent' column of 'bricks' in the
-- schema cache" until the cache's normal poll cycle catches up. Safe to
-- re-run — it's a LISTEN/NOTIFY channel.
notify pgrst, 'reload schema';
