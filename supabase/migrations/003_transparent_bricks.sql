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
